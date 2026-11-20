"""Order scoring pipeline: context from DB -> model -> persist -> policy -> action -> SSE."""
from __future__ import annotations

import time
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.events import broker
from app.db.models import Order, Prediction, Seller
from app.services import policy
from app.services.actions import audit, create_action
from app.services.model_registry import registry
from app.services.sellers import seller_settings
from app.services.serializers import action_dict, order_dict, prediction_dict

CANON = ["order_id", "order_date", "customer_id", "customer_phone", "customer_name", "pincode", "city", "state",
         "address", "order_value", "payment_method", "product_category", "sku", "quantity", "channel"]

_labelled_cache: dict[str, tuple[float, int]] = {}


def n_labelled(db: Session, seller_id: str, fresh: bool = False) -> int:
    hit = _labelled_cache.get(seller_id)
    if hit and not fresh and time.time() - hit[0] < 20:
        return hit[1]
    n = db.scalar(select(func.count(Order.id)).where(Order.seller_id == seller_id, Order.outcome.is_not(None))) or 0
    _labelled_cache[seller_id] = (time.time(), int(n))
    return int(n)


def invalidate_labelled(seller_id: str) -> None:
    _labelled_cache.pop(seller_id, None)


def normalize_order(d: dict[str, Any]) -> dict[str, Any]:
    o = {k: d.get(k) for k in CANON}
    o["order_id"] = str(o["order_id"] or f"RS-{uuid.uuid4().hex[:10].upper()}")
    od = o["order_date"]
    if od is None or od == "":
        od = datetime.now()
    elif isinstance(od, str):
        od = datetime.fromisoformat(od.replace("Z", "+00:00"))
    if hasattr(od, "to_pydatetime"):
        od = od.to_pydatetime()
    if od.tzinfo is not None:
        from datetime import timedelta, timezone

        od = od.astimezone(timezone(timedelta(hours=5, minutes=30))).replace(tzinfo=None)
    o["order_date"] = od
    if not o["customer_id"]:
        phone = "".join(ch for ch in str(o.get("customer_phone") or "") if ch.isdigit())
        o["customer_id"] = f"ph-{phone[-10:]}" if phone else f"guest-{uuid.uuid4().hex[:8]}"
    o["customer_id"] = str(o["customer_id"])
    o["pincode"] = str(o["pincode"] or "")[:6]
    o["order_value"] = float(o["order_value"] or 0)
    o["payment_method"] = str(o["payment_method"] or "COD").upper()
    o["product_category"] = str(o["product_category"] or "other")
    o["quantity"] = int(o["quantity"] or 1)
    o["channel"] = str(o["channel"] or "manual")
    return o


def build_context(db: Session, seller_id: str, orders: list[dict], settings: dict):
    from app.ml.scorer import ScoringContext

    cust_ids = list({o["customer_id"] for o in orders if o.get("customer_id")})
    pins = list({o["pincode"] for o in orders if o.get("pincode")})
    ch: dict[str, dict] = {}
    for i in range(0, len(cust_ids), 900):
        chunk = cust_ids[i:i + 900]
        rows = db.execute(
            select(
                Order.customer_id,
                func.count(Order.id),
                func.sum(case((Order.outcome == "RTO", 1), else_=0)),
                func.sum(case((Order.outcome == "DELIVERED", 1), else_=0)),
                func.max(Order.order_date),
            ).where(Order.seller_id == seller_id, Order.customer_id.in_(chunk)).group_by(Order.customer_id)
        ).all()
        for cid, n, rto, dl, last in rows:
            ch[cid] = {"orders": int(n or 0), "rto": int(rto or 0), "delivered": int(dl or 0), "last_order_at": last}
    ps: dict[str, dict] = {}
    for i in range(0, len(pins), 900):
        chunk = pins[i:i + 900]
        rows = db.execute(
            select(Order.pincode, func.count(Order.id), func.sum(case((Order.outcome == "RTO", 1), else_=0)))
            .where(Order.seller_id == seller_id, Order.pincode.in_(chunk), Order.outcome.is_not(None))
            .group_by(Order.pincode)
        ).all()
        for pin, n, rto in rows:
            ps[pin] = {"orders": int(n or 0), "rto": int(rto or 0)}
    fair = settings.get("fairness", {})
    cap = float(fair.get("pincode_cap", 0.35)) if fair.get("enforce", True) else 1.01
    return ScoringContext(
        customer_history=ch,
        pincode_stats=ps,
        thresholds=dict(settings.get("thresholds") or {"medium": 0.18, "high": 0.35}),
        n_seller_labelled=n_labelled(db, seller_id),
        pincode_cap=cap,
    )


def score_raw(db: Session, seller: Seller, orders: list[dict]) -> tuple[list[dict], list[dict]]:
    """Score without persisting. Returns (normalized orders, predictions)."""
    settings = seller_settings(seller)
    norm = [normalize_order(o) for o in orders]
    ctx = build_context(db, seller.id, norm, settings)
    scorer = registry.get(db, seller.id)
    preds = scorer.score(norm, ctx)
    return norm, preds


def what_if(db: Session, seller: Seller, order: dict, changes: dict) -> dict:
    settings = seller_settings(seller)
    o = normalize_order(order)
    ctx = build_context(db, seller.id, [o], settings)
    scorer = registry.get(db, seller.id)
    res = scorer.what_if(o, changes or {}, ctx)
    now = datetime.now()
    base = dict(res["base"], created_at=now)
    new = dict(res["new"], created_at=now)
    return {"base": prediction_dict(base), "new": prediction_dict(new), "delta": round(float(res.get("delta") or 0.0), 4)}


def score_orders(
    db: Session,
    seller: Seller,
    orders: list[dict],
    *,
    auto_action: bool = True,
    source: str = "api",
    publish: bool = True,
    send_messages: bool = True,
    created_at: datetime | None = None,
    backdate: bool = False,
    commit: bool = True,
) -> list[dict]:
    """Score + persist live orders. Returns list of ScoredOrder dicts (plus internal refs under '_order'/'_action')."""
    settings = seller_settings(seller)
    norm, preds = score_raw(db, seller, orders)

    # existing orders (idempotent webhooks / re-scoring)
    ids = [o["order_id"] for o in norm]
    existing: dict[str, Order] = {}
    for i in range(0, len(ids), 900):
        for row in db.scalars(select(Order).where(Order.seller_id == seller.id, Order.order_id.in_(ids[i:i + 900]))):
            existing[row.order_id] = row

    auto = auto_action and bool(settings.get("actions", {}).get("auto_trigger", True))
    results: list[dict] = []
    for o, pr in zip(norm, preds):
        now = o["order_date"] if backdate else (created_at or datetime.now())
        row = existing.get(o["order_id"])
        is_new = row is None
        if row is None:
            row = Order(seller_id=seller.id, **o, status="SCORED", is_historical=False, source=source,
                        created_at=now, updated_at=now)
            db.add(row)
        rec = policy.recommend(o, pr, settings, seller.id)
        row.risk_probability = float(pr["probability"])
        row.risk_tier = pr["tier"]
        row.recommended_action = rec["action"]
        row.recommendation = {k: rec[k] for k in ("action", "reason", "expected_saving", "action_cost", "alternatives",
                                                   "experiment_group", "held_out_action")}
        if row.status in ("NEW",):
            row.status = "SCORED"
        db.flush()
        p = Prediction(
            order_pk=row.id, seller_id=seller.id, probability=float(pr["probability"]), tier=pr["tier"],
            confidence=pr.get("confidence", "medium"), cold_start=bool(pr.get("cold_start")),
            model_version=str(pr.get("model_version")), reasons=pr.get("reasons") or [],
            pincode_share=float(pr.get("pincode_share") or 0.0), fairness_adjusted=bool(pr.get("fairness_adjusted")),
            created_at=now,
        )
        db.add(p)
        if is_new:
            audit(db, seller.id, row.id, "created", f"Order received via {source}", at=now)
        audit(db, seller.id, row.id, "scored",
              f"Scored {pr['probability']:.0%} ({pr['tier']} risk) by {pr.get('model_version')}"
              + (" · fairness guard applied" if pr.get("fairness_adjusted") else ""), at=now)

        act = None
        if rec["action"] == "HOLDOUT_CONTROL":
            row.experiment_group = "control"
            if auto and is_new:
                act = create_action(db, row, "HOLDOUT_CONTROL", settings, experiment_group="control", at=now,
                                    publish=publish)
        elif rec["action"] != "NONE":
            row.experiment_group = row.experiment_group or "treatment"
            if auto and is_new:
                act = create_action(db, row, rec["action"], settings, experiment_group="treatment",
                                    send=send_messages, at=now, publish=publish)
        db.flush()
        results.append({
            "order": order_dict(row, p),
            "prediction": prediction_dict(p),
            "recommendation": row.recommendation,
            "action": action_dict(act),
            "_order": row,
            "_action": act,
            "_prediction": pr,
        })
    if commit:
        db.commit()
    if publish:
        for r in results:
            broker.publish("order_scored", public(r))
    return results


def public(r: dict) -> dict:
    return {k: v for k, v in r.items() if not k.startswith("_")}
