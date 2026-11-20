"""Before/after impact report + treatment-vs-holdout experiment. All savings are ESTIMATES.

Outcome definition for live (post) orders is intent-to-treat: an order counts as
resolved when it was delivered, returned (RTO) or cancelled before dispatch; only
RTO counts as a failure (a pre-dispatch cancellation costs no shipping).
"""
from __future__ import annotations

import csv
import io
import math
from typing import Any

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.jsonsafe import json_safe
from app.db.models import Action, Order
from app.services.ingest import orders_frame

LABEL = "Estimated — validate with pilot"
TARGET_MIN, TARGET_MAX = 0.15, 0.25


def _norm_cdf(x: float) -> float:
    return 0.5 * math.erfc(-x / math.sqrt(2))


def two_proportion_test(x_c: int, n_c: int, x_t: int, n_t: int) -> dict[str, Any]:
    """Control vs treatment RTO rates. uplift = p_control - p_treatment (positive = fewer RTOs)."""
    if n_c == 0 or n_t == 0:
        return {"uplift": 0.0, "p_value": None, "ci95": None, "significant": False}
    pc, pt = x_c / n_c, x_t / n_t
    diff = pc - pt
    # Wald (unpooled) z-test so the p-value and the 95% CI always agree.
    se = math.sqrt(pc * (1 - pc) / n_c + pt * (1 - pt) / n_t)
    if se == 0:  # degenerate (e.g. 0 RTOs in both arms): fall back to pooled SE
        pooled = (x_c + x_t) / (n_c + n_t)
        se = math.sqrt(pooled * (1 - pooled) * (1 / n_c + 1 / n_t))
    p_value = 2 * (1 - _norm_cdf(abs(diff) / se)) if se > 0 else None
    ci = [diff - 1.96 * se, diff + 1.96 * se]
    return {
        "uplift": round(diff, 4),
        "p_value": round(p_value, 4) if p_value is not None else None,
        "ci95": [round(ci[0], 4), round(ci[1], 4)],
        "significant": bool(p_value is not None and p_value < 0.05),
    }


def _period(df: pd.DataFrame) -> str:
    if not len(df):
        return "—"
    return f"{df['order_date'].min():%d %b %Y} – {df['order_date'].max():%d %b %Y}"


def compute(db: Session, seller_id: str, settings: dict) -> dict[str, Any]:
    costs = settings.get("costs", {})
    df = orders_frame(db, seller_id, extra=True)
    hist = df[df["is_historical"].astype(bool)] if len(df) else df
    live = df[~df["is_historical"].astype(bool)] if len(df) else df
    base = hist[hist["outcome"].isin(["DELIVERED", "RTO"])] if len(hist) else hist
    base_rate = float(base["outcome"].eq("RTO").mean()) if len(base) else 0.0

    if len(live):
        resolved = live[live["outcome"].isin(["DELIVERED", "RTO"]) | live["status"].eq("CANCELLED")].copy()
    else:
        resolved = live.copy()
    resolved["is_rto"] = resolved["outcome"].eq("RTO").astype(int) if len(resolved) else pd.Series(dtype=int)
    post_rate = float(resolved["is_rto"].mean()) if len(resolved) else 0.0
    rel = (base_rate - post_rate) / base_rate if base_rate > 0 and len(resolved) else 0.0

    treat = resolved[resolved["experiment_group"].eq("treatment")] if len(resolved) else resolved
    ctrl = resolved[resolved["experiment_group"].eq("control")] if len(resolved) else resolved
    test = two_proportion_test(int(ctrl["is_rto"].sum()) if len(ctrl) else 0, len(ctrl),
                               int(treat["is_rto"].sum()) if len(treat) else 0, len(treat))

    avg_val = float(live["order_value"].mean()) if len(live) else (float(hist["order_value"].mean()) if len(hist) else 0.0)
    per_rto = float(costs.get("forward_shipping", 70) + costs.get("return_shipping", 70) + costs.get("packaging", 25)
                    + costs.get("turnover_cost_pct", 0.04) * avg_val)

    # actions joined with order outcomes (live only)
    arows = db.execute(
        select(Action.type, Action.status, Action.cost, Action.experiment_group, Action.created_at,
               Order.outcome, Order.status)
        .join(Order, Order.id == Action.order_pk)
        .where(Action.seller_id == seller_id, Order.is_historical.is_(False))
    ).all()
    adf = pd.DataFrame(arows, columns=["type", "status", "cost", "group", "created_at", "outcome", "order_status"])
    intervention_cost = float(adf.loc[adf["group"].eq("treatment"), "cost"].sum()) if len(adf) else 0.0

    if len(ctrl) >= 10 and len(treat) >= 10:
        rto_avoided = test["uplift"] * len(treat)
        method = "experiment (treatment vs holdout control)"
    else:
        rto_avoided = (base_rate - post_rate) * len(resolved)
        method = "before/after (insufficient holdout sample)"
    gross = rto_avoided * per_rto
    net = gross - intervention_cost
    roi = net / intervention_cost if intervention_cost > 0 else None

    by_action = []
    if len(adf):
        for t, g in adf.groupby("type"):
            res = g[g["outcome"].isin(["DELIVERED", "RTO"]) | g["order_status"].eq("CANCELLED")]
            confirmed = g["status"].isin(["CONFIRMED", "CONVERTED_PREPAID", "ADDRESS_UPDATED"]).sum()
            by_action.append({
                "action": t, "n": int(len(g)),
                "confirm_rate": round(float(confirmed) / len(g), 4),
                "rto_rate": round(float(res["outcome"].eq("RTO").mean()), 4) if len(res) else None,
                "resolved": int(len(res)),
                "cancelled_rate": round(float(g["status"].eq("CANCELLED").mean()), 4),
                "cost": round(float(g["cost"].sum()), 2),
            })
        by_action.sort(key=lambda r: -r["n"])

    monthly = []
    if len(base):
        b = base.copy()
        b["period"] = b["order_date"].dt.to_period("M").astype(str)
        for p, g in b.groupby("period"):
            monthly.append({"period": p, "phase": "baseline", "orders": int(len(g)),
                            "rto_rate": round(float(g["outcome"].eq("RTO").mean()), 4), "saved": 0.0})
    if len(resolved):
        r = resolved.copy()
        r["period"] = r["order_date"].dt.to_period("M").astype(str)
        cost_by_m: dict[str, float] = {}
        if len(adf):
            a2 = adf[adf["group"].eq("treatment")].copy()
            if len(a2):
                a2["period"] = pd.to_datetime(a2["created_at"]).dt.to_period("M").astype(str)
                cost_by_m = a2.groupby("period")["cost"].sum().to_dict()
        for p, g in r.groupby("period"):
            rate = float(g["is_rto"].mean())
            saved = (base_rate - rate) * len(g) * per_rto - float(cost_by_m.get(p, 0.0))
            monthly.append({"period": p, "phase": "pilot", "orders": int(len(g)), "rto_rate": round(rate, 4),
                            "saved": round(saved, 2)})
    # merge duplicate periods (baseline + pilot in same month) -> keep both entries, ordered
    monthly.sort(key=lambda m: (m["period"], m["phase"] != "baseline"))

    return json_safe({
        "label": LABEL,
        "baseline": {"period": _period(base), "orders": int(len(base)), "rto_rate": round(base_rate, 4)},
        "post": {"period": _period(resolved), "orders": int(len(resolved)), "rto_rate": round(post_rate, 4),
                 "pending": int(len(live) - len(resolved))},
        "relative_reduction": round(rel, 4),
        "experiment": {
            "treatment": {"n": int(len(treat)), "rto_rate": round(float(treat["is_rto"].mean()), 4) if len(treat) else 0.0},
            "control": {"n": int(len(ctrl)), "rto_rate": round(float(ctrl["is_rto"].mean()), 4) if len(ctrl) else 0.0},
            **test,
            "holdout_pct": settings.get("holdout_pct", 0.1),
        },
        "costs": {
            "per_rto_cost": round(per_rto, 2),
            "rto_avoided": round(rto_avoided, 1),
            "gross_saved": round(gross, 2),
            "intervention_cost": round(intervention_cost, 2),
            "net_saved": round(net, 2),
            "roi": round(roi, 2) if roi is not None else 0.0,
            "method": method,
        },
        "by_action": by_action,
        "monthly": monthly,
        "target": {"min": TARGET_MIN, "max": TARGET_MAX, "met": bool(rel >= TARGET_MIN)},
        "notes": [
            "All savings are estimates from observed outcomes and configured unit costs; validate with a real pilot.",
            "Post-period RTO rate is intent-to-treat: pre-dispatch cancellations count as resolved without RTO.",
            "Causal uplift comes from the randomized holdout control group; before/after comparisons can be confounded by seasonality and mix.",
        ],
    })


def to_csv(report: dict[str, Any]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["section", "metric", "value"])
    w.writerow(["meta", "label", report["label"]])
    for sec in ("baseline", "post"):
        for k, v in report[sec].items():
            w.writerow([sec, k, v])
    w.writerow(["summary", "relative_reduction", report["relative_reduction"]])
    exp = report["experiment"]
    for g in ("treatment", "control"):
        for k, v in exp[g].items():
            w.writerow(["experiment", f"{g}_{k}", v])
    for k in ("uplift", "p_value", "significant"):
        w.writerow(["experiment", k, exp.get(k)])
    if exp.get("ci95"):
        w.writerow(["experiment", "ci95_low", exp["ci95"][0]])
        w.writerow(["experiment", "ci95_high", exp["ci95"][1]])
    for k, v in report["costs"].items():
        w.writerow(["costs", k, v])
    for k, v in report["target"].items():
        w.writerow(["target", k, v])
    w.writerow([])
    w.writerow(["action", "n", "confirm_rate", "rto_rate", "cost"])
    for a in report["by_action"]:
        w.writerow([a["action"], a["n"], a["confirm_rate"], a["rto_rate"], a["cost"]])
    w.writerow([])
    w.writerow(["period", "phase", "orders", "rto_rate", "saved"])
    for m in report["monthly"]:
        w.writerow([m["period"], m["phase"], m["orders"], m["rto_rate"], m["saved"]])
    return buf.getvalue()
