from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import current_seller
from app.core.jsonsafe import json_safe
from app.db.models import Action, AuditLog, Order, Prediction, Seller
from app.db.session import get_db
from app.schemas.api import ActionIn, DecisionIn, OutcomeIn
from app.services import orders as order_svc
from app.services.actions import create_action
from app.services.sellers import seller_settings
from app.services.serializers import action_dict, order_dict, orders_with_predictions, prediction_dict

router = APIRouter(tags=["orders"])

SORTS = {
    "created": (Order.created_at, Order.id),
    "date": (Order.order_date, Order.id),
    "risk": (Order.risk_probability, Order.id),
    "value": (Order.order_value, Order.id),
    "id": (Order.id,),
}
QUEUE_PENDING = ("SCORED", "AWAITING_CUSTOMER", "ON_HOLD")


def _get_order(db: Session, seller: Seller, id: int) -> Order:
    o = db.get(Order, id)
    if o is None or o.seller_id != seller.id:
        raise HTTPException(404, f"Order {id} not found")
    return o


@router.get("/orders")
def list_orders(
    tier: Literal["low", "medium", "high", ""] | None = None,
    status: str | None = None,
    q: str | None = None,
    payment_method: str | None = None,
    historical: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    sort: str = "-created",
    db: Session = Depends(get_db),
    seller: Seller = Depends(current_seller),
):
    conds = [Order.seller_id == seller.id]
    if tier:
        conds.append(Order.risk_tier == tier)
    if status:
        sts = [s.strip().upper() for s in status.split(",") if s.strip()]
        conds.append(Order.status.in_(sts))
    if payment_method:
        conds.append(Order.payment_method == payment_method.upper())
    if historical is not None:
        conds.append(Order.is_historical.is_(historical))
    if q:
        like = f"%{q.strip()}%"
        conds.append(or_(Order.order_id.ilike(like), Order.customer_name.ilike(like), Order.customer_id.ilike(like),
                         Order.pincode.ilike(like), Order.city.ilike(like)))
    where = and_(*conds)
    total = db.scalar(select(func.count(Order.id)).where(where)) or 0
    desc = sort.startswith("-")
    cols = SORTS.get(sort.lstrip("-"), SORTS["created"])
    order_by = [c.desc() if desc else c.asc() for c in cols]
    if sort.lstrip("-") == "risk":
        order_by = [Order.risk_probability.is_(None)] + order_by  # nulls last
    rows = db.scalars(select(Order).where(where).order_by(*order_by).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": orders_with_predictions(db, list(rows)), "total": int(total), "page": page, "page_size": page_size}


@router.get("/orders/{id}")
def get_order(id: int, db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    o = _get_order(db, seller, id)
    preds = db.scalars(select(Prediction).where(Prediction.order_pk == o.id).order_by(Prediction.id)).all()
    acts = db.scalars(select(Action).where(Action.order_pk == o.id).order_by(Action.id)).all()
    logs = db.scalars(select(AuditLog).where(AuditLog.order_pk == o.id).order_by(AuditLog.created_at, AuditLog.id)).all()
    timeline = [{"at": l.created_at, "kind": l.kind, "text": l.text, "actor": l.actor} for l in logs]
    if not any(t["kind"] == "created" for t in timeline):
        timeline.insert(0, {"at": o.order_date, "kind": "placed", "text": f"Order placed via {o.channel}", "actor": "customer"})
    return json_safe({
        "order": order_dict(o, preds[-1] if preds else None, include_prediction=bool(preds)) | ({} if preds else {"prediction": None}),
        "predictions": [prediction_dict(p) for p in preds],
        "actions": [action_dict(a) for a in acts],
        "timeline": timeline,
    })


@router.post("/orders/{id}/outcome")
def record_outcome(id: int, body: OutcomeIn, db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    o = _get_order(db, seller, id)
    if o.status == "CANCELLED":
        raise HTTPException(409, "Order was cancelled before dispatch; it cannot have a delivery outcome")
    order_svc.set_outcome(db, o, body.outcome)
    return order_dict(o)


@router.post("/orders/{id}/actions")
def trigger_action(id: int, body: ActionIn, db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    o = _get_order(db, seller, id)
    if body.type in ("NONE", "HOLDOUT_CONTROL"):
        raise HTTPException(422, f"{body.type} cannot be triggered manually")
    if o.status in ("SHIPPED", "DELIVERED", "RTO", "CANCELLED"):
        raise HTTPException(409, f"Order is {o.status.lower()}; interventions are no longer possible")
    if body.type == "PREPAID_NUDGE" and o.payment_method != "COD":
        raise HTTPException(422, "Order is already prepaid")
    a = create_action(db, o, body.type, seller_settings(seller), channel=body.channel, actor="seller")
    db.commit()
    return action_dict(a)


@router.get("/queue")
def queue(status: str = "pending", db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    base = [Order.seller_id == seller.id, Order.is_historical.is_(False), Order.risk_tier.in_(["medium", "high"])]
    conds = list(base)
    if status == "pending":
        conds += [Order.status.in_(QUEUE_PENDING),
                  or_(Order.experiment_group.is_(None), Order.experiment_group != "control")]
    elif status != "all":
        conds.append(Order.status == status.upper())
    rows = db.scalars(select(Order).where(and_(*conds))
                      .order_by(Order.risk_probability.desc(), Order.created_at.desc()).limit(200)).all()
    counts_rows = db.execute(select(Order.status, Order.risk_tier, func.count(Order.id)).where(and_(*base))
                             .group_by(Order.status, Order.risk_tier)).all()
    counts = {"pending": 0, "high": 0, "medium": 0, "awaiting_customer": 0, "on_hold": 0, "scored": 0,
              "confirmed": 0, "cancelled": 0, "approved": 0, "converted_prepaid": 0}
    for st, tr, n in counts_rows:
        key = st.lower()
        counts[key] = counts.get(key, 0) + n
        if st in QUEUE_PENDING:
            counts["pending"] += n
    # control-group orders are excluded from the pending queue (protects the experiment)
    ctrl = db.scalar(select(func.count(Order.id)).where(and_(*base), Order.status.in_(QUEUE_PENDING),
                                                        Order.experiment_group == "control")) or 0
    counts["pending"] -= ctrl
    counts["holdout_control"] = int(ctrl)
    if status == "pending":
        counts["high"] = sum(1 for o in rows if o.risk_tier == "high")
        counts["medium"] = sum(1 for o in rows if o.risk_tier == "medium")
    return {"items": orders_with_predictions(db, list(rows)), "counts": counts}


@router.post("/queue/{id}/decision")
def decision(id: int, body: DecisionIn, db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    o = _get_order(db, seller, id)
    try:
        order_svc.decide(db, o, body.decision, seller_settings(seller), body.note)
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    return order_dict(o)
