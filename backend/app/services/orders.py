"""Order state changes: outcomes and seller queue decisions."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.events import broker
from app.db.models import Action, Order
from app.services.actions import OPEN_STATUSES, audit, create_action
from app.services.scoring import invalidate_labelled
from app.services.serializers import order_dict

DECISION_STATUS = {"approve": "APPROVED", "hold": "ON_HOLD", "cancel": "CANCELLED"}


def set_outcome(db: Session, order: Order, outcome: str, *, at: datetime | None = None, publish: bool = True,
                commit: bool = True) -> Order:
    now = at or datetime.now()
    order.outcome = outcome
    order.status = outcome
    order.outcome_at = now
    order.updated_at = now
    audit(db, order.seller_id, order.id, "outcome",
          "Delivered to customer" if outcome == "DELIVERED" else "Returned to origin (RTO)", at=now)
    if commit:
        db.commit()
    invalidate_labelled(order.seller_id)
    if publish:
        broker.publish("outcome_recorded", order_dict(order))
    return order


def decide(db: Session, order: Order, decision: str, settings: dict, note: str | None = None,
           *, actor: str = "seller", at: datetime | None = None, publish: bool = True) -> Order:
    now = at or datetime.now()
    if order.status in ("SHIPPED", "DELIVERED", "RTO"):
        raise ValueError(f"Order already {order.status.lower()}; decisions are no longer possible")
    if decision in DECISION_STATUS:
        order.status = DECISION_STATUS[decision]
        # close open seller tasks (manual review / call)
        for a in db.scalars(select(Action).where(Action.order_pk == order.id, Action.status.in_(OPEN_STATUSES),
                                                 Action.type.in_(["MANUAL_REVIEW", "CONFIRM_CALL"]))):
            a.status = "RESPONDED"
            a.response = decision
            a.updated_at = now
            if publish:
                from app.services.serializers import action_dict

                broker.publish("action_updated", action_dict(a))
        audit(db, order.seller_id, order.id, "decision",
              f"Seller decision: {decision}" + (f" — {note}" if note else ""), actor=actor, at=now)
    else:
        mcfg = settings.get("messaging", {})
        type_ = {
            "send_confirmation": "CONFIRM_SMS" if mcfg.get("default_channel") == "sms" else "CONFIRM_WHATSAPP",
            "send_prepaid_nudge": "PREPAID_NUDGE",
            "verify_address": "ADDRESS_VERIFY",
        }[decision]
        if type_ == "PREPAID_NUDGE" and order.payment_method != "COD":
            raise ValueError("Order is already prepaid; a prepaid nudge is not applicable")
        create_action(db, order, type_, settings, actor=actor, at=now, publish=publish)
        if note:
            audit(db, order.seller_id, order.id, "note", note, actor=actor, at=now)
    order.updated_at = now
    db.commit()
    return order
