"""ORM -> JSON-safe dict serializers matching CONTRACT section 4."""
from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.jsonsafe import json_safe
from app.db.models import Action, Order, Prediction
from app.schemas.api import mask_phone


def _f(v: Any, nd: int = 4) -> float:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return 0.0
    if x != x or x in (float("inf"), float("-inf")):
        return 0.0
    return round(x, nd)


def prediction_dict(p: Prediction | dict | None) -> dict | None:
    if p is None:
        return None
    if isinstance(p, dict):
        d = dict(p)
        d.setdefault("created_at", None)
        return json_safe(d)
    return json_safe({
        "probability": _f(p.probability),
        "tier": p.tier,
        "confidence": p.confidence,
        "cold_start": bool(p.cold_start),
        "model_version": p.model_version,
        "reasons": p.reasons or [],
        "pincode_share": _f(p.pincode_share),
        "fairness_adjusted": bool(p.fairness_adjusted),
        "created_at": p.created_at,
    })


def action_dict(a: Action | None) -> dict | None:
    if a is None:
        return None
    return json_safe({
        "id": a.id,
        "order_id": a.order_pk,
        "type": a.type,
        "status": a.status,
        "channel": a.channel,
        "message": a.message,
        "response": a.response,
        "experiment_group": a.experiment_group,
        "cost": _f(a.cost, 2),
        "token": a.token,
        "created_at": a.created_at,
        "updated_at": a.updated_at,
        # extras (additive)
        "kind": a.kind,
        "error": a.error,
        "expires_at": a.expires_at,
    })


def order_dict(o: Order, prediction: Prediction | dict | None = None, *, include_prediction: bool = True) -> dict:
    pred = None
    if include_prediction:
        if prediction is None and o.risk_tier is not None:
            # caller did not pre-load; take latest from relationship (lazy load)
            preds = o.predictions
            prediction = preds[-1] if preds else None
        pred = prediction_dict(prediction)
    return json_safe({
        "id": o.id,
        "order_id": o.order_id,
        "order_date": o.order_date,
        "customer_id": o.customer_id,
        "customer_name": o.customer_name,
        "customer_phone": mask_phone(o.customer_phone),
        "pincode": o.pincode,
        "city": o.city,
        "state": o.state,
        "address": o.address,
        "order_value": _f(o.order_value, 2),
        "payment_method": o.payment_method,
        "product_category": o.product_category,
        "sku": o.sku,
        "quantity": o.quantity,
        "channel": o.channel,
        "outcome": o.outcome,
        "status": o.status,
        "is_historical": bool(o.is_historical),
        "prediction": pred,
        "recommendation": o.recommendation,
        # extras (additive)
        "experiment_group": o.experiment_group,
        "created_at": o.created_at,
    })


def latest_predictions(db: Session, order_pks: Iterable[int]) -> dict[int, Prediction]:
    pks = list(order_pks)
    if not pks:
        return {}
    out: dict[int, Prediction] = {}
    for i in range(0, len(pks), 900):
        chunk = pks[i:i + 900]
        rows = db.scalars(select(Prediction).where(Prediction.order_pk.in_(chunk)).order_by(Prediction.id)).all()
        for p in rows:
            out[p.order_pk] = p  # later ids overwrite -> latest
    return out


def orders_with_predictions(db: Session, orders: list[Order]) -> list[dict]:
    preds = latest_predictions(db, [o.id for o in orders if o.risk_tier is not None])
    return [order_dict(o, preds.get(o.id), include_prediction=True) if o.id in preds else order_dict(o, None, include_prediction=False) | {"prediction": None} for o in orders]
