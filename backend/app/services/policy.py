"""Cost-aware intervention policy.

loss          = forward + return + packaging + turnover_pct * value     (cost of one RTO)
net(a)        = p * eff_a * loss  -  cost_a  -  (1 - p) * friction_a * margin_pct * value
recommended   = argmax_a net(a)   (NONE has net 0)  -- or tier rules when policy == "tier_rules"

Never auto-cancels. A deterministic ``holdout_pct`` of *flagged* orders is
assigned to HOLDOUT_CONTROL (no intervention) so impact can be measured causally.
Orders whose tier was downgraded by the fairness guard only get soft actions.
"""
from __future__ import annotations

import hashlib
from typing import Any

# effectiveness priors: share of would-be RTOs the action prevents
EFFECTIVENESS = {
    "CONFIRM_WHATSAPP": 0.35,
    "CONFIRM_SMS": 0.30,
    "CONFIRM_CALL": 0.45,
    "PREPAID_NUDGE": 0.55 * 0.30,  # effect x acceptance
    "ADDRESS_VERIFY": 0.25,
    "MANUAL_REVIEW": 0.50,
}
# friction: probability a genuine (would-deliver) customer is lost because of the action
FRICTION = {
    "CONFIRM_WHATSAPP": 0.010,
    "CONFIRM_SMS": 0.010,
    "CONFIRM_CALL": 0.012,
    "PREPAID_NUDGE": 0.015,
    "ADDRESS_VERIFY": 0.005,
    "MANUAL_REVIEW": 0.030,
}
SOFT_ACTIONS = {"NONE", "CONFIRM_WHATSAPP", "CONFIRM_SMS", "ADDRESS_VERIFY"}
MESSAGE_ACTIONS = {"CONFIRM_WHATSAPP", "CONFIRM_SMS", "PREPAID_NUDGE", "ADDRESS_VERIFY"}
MANUAL_REVIEW_COST = 10.0  # staff minutes, INR

LABELS = {
    "NONE": "No action — ship normally",
    "CONFIRM_WHATSAPP": "WhatsApp order confirmation",
    "CONFIRM_SMS": "SMS order confirmation",
    "CONFIRM_CALL": "Confirmation call",
    "PREPAID_NUDGE": "Prepaid conversion nudge",
    "ADDRESS_VERIFY": "Address verification",
    "MANUAL_REVIEW": "Manual review before dispatch",
    "HOLDOUT_CONTROL": "Holdout (control group)",
}


def rto_loss(order_value: float, costs: dict) -> float:
    return float(costs.get("forward_shipping", 70) + costs.get("return_shipping", 70)
                 + costs.get("packaging", 25) + costs.get("turnover_cost_pct", 0.04) * float(order_value or 0))


def action_cost(action: str, costs: dict, channel: str | None = None) -> float:
    if action in ("NONE", "HOLDOUT_CONTROL"):
        return 0.0
    if action == "CONFIRM_CALL":
        return float(costs.get("call", 6))
    if action == "CONFIRM_SMS":
        return float(costs.get("sms", 0.25))
    if action == "MANUAL_REVIEW":
        return float(costs.get("manual_review", MANUAL_REVIEW_COST))
    if channel == "sms":
        return float(costs.get("sms", 0.25))
    return float(costs.get("whatsapp_msg", 0.8))


def _has_address_issue(prediction: dict) -> bool:
    for r in prediction.get("reasons") or []:
        txt = f"{r.get('feature', '')} {r.get('label', '')}".lower()
        if "address" in txt and float(r.get("impact") or 0) > 0:
            return True
    return False


def holdout_assigned(seller_id: str, order_id: str, holdout_pct: float) -> bool:
    if holdout_pct <= 0:
        return False
    h = hashlib.sha256(f"{seller_id}:{order_id}:holdout".encode()).hexdigest()
    return (int(h[:8], 16) / 0xFFFFFFFF) < holdout_pct


def evaluate(order: dict, prediction: dict, settings: dict) -> list[dict]:
    """Net value for every candidate action, best first."""
    costs = settings.get("costs", {})
    p = float(prediction.get("probability") or 0.0)
    value = float(order.get("order_value") or 0.0)
    loss = rto_loss(value, costs)
    margin = float(costs.get("margin_pct", 0.35))
    default_ch = settings.get("messaging", {}).get("default_channel", "whatsapp")
    is_cod = str(order.get("payment_method", "")).upper() == "COD"
    addr_issue = _has_address_issue(prediction)

    candidates = ["CONFIRM_WHATSAPP" if default_ch == "whatsapp" else "CONFIRM_SMS",
                  "CONFIRM_CALL", "ADDRESS_VERIFY", "MANUAL_REVIEW"]
    if default_ch == "whatsapp":
        candidates.append("CONFIRM_SMS")
    if is_cod:
        candidates.append("PREPAID_NUDGE")
    if prediction.get("fairness_adjusted"):
        candidates = [c for c in candidates if c in SOFT_ACTIONS]

    out = [{"action": "NONE", "net_value": 0.0, "expected_saving": 0.0, "action_cost": 0.0}]
    for a in candidates:
        eff = EFFECTIVENESS[a]
        if a == "ADDRESS_VERIFY" and not addr_issue:
            eff *= 0.4
        cost = action_cost(a, costs)
        saving = p * eff * loss
        friction = (1 - p) * FRICTION[a] * margin * value
        out.append({"action": a, "net_value": round(saving - cost - friction, 2),
                    "expected_saving": round(saving, 2), "action_cost": round(cost, 2)})
    out.sort(key=lambda r: r["net_value"], reverse=True)
    return out


def recommend(order: dict, prediction: dict, settings: dict, seller_id: str = "demo") -> dict:
    """Return Recommendation dict (+ additive ``experiment_group`` / ``held_out_action``)."""
    evals = evaluate(order, prediction, settings)
    by_action = {e["action"]: e for e in evals}
    tier = prediction.get("tier", "low")
    p = float(prediction.get("probability") or 0.0)
    acfg = settings.get("actions", {})
    policy = acfg.get("policy", "cost_optimal")
    is_cod = str(order.get("payment_method", "")).upper() == "COD"

    if policy == "tier_rules":
        action = acfg.get(tier, "NONE") or "NONE"
        if action == "PREPAID_NUDGE" and not is_cod:
            action = "CONFIRM_WHATSAPP"
        if action == "HOLDOUT_CONTROL":
            action = "NONE"
        if prediction.get("fairness_adjusted") and action not in SOFT_ACTIONS:
            action = "CONFIRM_WHATSAPP"
        why = f"Tier rule: {tier} risk ({p:.0%}) → {LABELS.get(action, action)}"
    else:
        best = evals[0]
        action = best["action"]
        # never intervene on low tier orders unless economics are clearly positive
        if tier == "low" and best["net_value"] < 1.0:
            action = "NONE"
        if action == "NONE":
            why = f"Low expected loss at {p:.0%} RTO risk — intervention would cost more than it saves"
        else:
            why = (f"{LABELS[action]} has the best expected value at {p:.0%} RTO risk "
                   f"(saves ~₹{by_action[action]['expected_saving']:.0f} for ₹{by_action[action]['action_cost']:.2f})")
    if prediction.get("fairness_adjusted") and action != "NONE":
        why += " · softer action because the tier was capped by the pincode fairness guard"

    chosen = by_action.get(action) or {"expected_saving": 0.0, "action_cost": action_cost(action, settings.get("costs", {}))}
    rec: dict[str, Any] = {
        "action": action,
        "reason": why,
        "expected_saving": float(chosen["expected_saving"]),
        "action_cost": float(chosen["action_cost"]),
        "alternatives": [{"action": e["action"], "net_value": e["net_value"]} for e in evals],
        "experiment_group": "treatment",
        "held_out_action": None,
    }
    if action != "NONE" and holdout_assigned(seller_id, str(order.get("order_id")), float(settings.get("holdout_pct", 0.1))):
        rec["held_out_action"] = action
        rec["action"] = "HOLDOUT_CONTROL"
        rec["experiment_group"] = "control"
        rec["reason"] = (f"Randomly held out ({float(settings.get('holdout_pct', 0.1)):.0%} of flagged orders) as a control "
                         f"group — no intervention, so the causal impact of {LABELS[action]} can be measured")
        rec["expected_saving"] = 0.0
        rec["action_cost"] = 0.0
    return rec
