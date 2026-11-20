"""Intervention actions: create/send messages, tasks, and process customer responses."""
from __future__ import annotations

import asyncio
import secrets
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.core.events import broker
from app.core.logging import get_logger
from app.db.models import Action, AuditLog, Order
from app.services.policy import LABELS, action_cost
from app.services.serializers import action_dict, order_dict

log = get_logger("actions")

KIND_BY_TYPE = {
    "CONFIRM_WHATSAPP": "confirm",
    "CONFIRM_SMS": "confirm",
    "CONFIRM_CALL": "confirm",
    "PREPAID_NUDGE": "prepaid_nudge",
    "ADDRESS_VERIFY": "address_verify",
}
OPTIONS_BY_KIND = {
    "confirm": ["confirm", "cancel", "update_address"],
    "prepaid_nudge": ["convert_prepaid", "confirm", "cancel"],
    "address_verify": ["update_address", "confirm", "cancel"],
}
RESPONDED_STATUSES = {"RESPONDED", "CONFIRMED", "CANCELLED", "CONVERTED_PREPAID", "ADDRESS_UPDATED"}
OPEN_STATUSES = {"PENDING", "SENT", "DELIVERED"}
TOKEN_TTL = timedelta(hours=48)
# order statuses that can no longer be changed by a customer response
FINAL_ORDER_STATUSES = {"SHIPPED", "DELIVERED", "RTO", "CANCELLED"}


def audit(db: Session, seller_id: str, order_pk: int | None, kind: str, text: str,
          data: dict | None = None, actor: str | None = "system", at: datetime | None = None) -> None:
    db.add(AuditLog(seller_id=seller_id, order_pk=order_pk, kind=kind, text=text, data=data, actor=actor,
                    created_at=at or datetime.now()))


def order_payload(o: Order) -> dict[str, Any]:
    return {
        "order_id": o.order_id, "order_date": o.order_date, "customer_id": o.customer_id,
        "customer_phone": o.customer_phone, "customer_name": o.customer_name, "pincode": o.pincode,
        "city": o.city, "state": o.state, "address": o.address, "order_value": o.order_value,
        "payment_method": o.payment_method, "product_category": o.product_category, "sku": o.sku,
        "quantity": o.quantity, "channel": o.channel,
    }


def _run_async(coro):
    """Run a coroutine from sync code (we are always in a worker thread here)."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    # Called from inside an event loop thread (should not happen) -> run in a helper thread.
    import concurrent.futures

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        return ex.submit(asyncio.run, coro).result()


def _render(kind: str, o: Order, link: str, store_name: str, lang: str) -> str:
    try:
        from app.integrations.messaging import render_template

        return render_template(kind, order_payload(o), link, store_name, lang)  # type: ignore[arg-type]
    except Exception as exc:  # pragma: no cover - integration module failure
        log.warning("render_template failed (%s); using fallback text", exc)
        return (f"Hi {o.customer_name or 'there'}, please confirm your {store_name} order {o.order_id} "
                f"of Rs {o.order_value:,.0f}: {link}")


def _send(provider_name: str, to: str | None, channel: str, body: str, meta: dict) -> tuple[bool, str, str | None, str | None]:
    try:
        from app.integrations.messaging import get_provider

        provider = get_provider(provider_name)
        if not to:
            return False, getattr(provider, "name", provider_name), None, "Customer phone number missing"
        res = _run_async(provider.send(to, channel, body, meta))  # type: ignore[arg-type]
        return bool(res.ok), res.provider, res.message_id, res.error
    except Exception as exc:
        log.warning("send failed: %s", exc)
        return False, provider_name, None, str(exc)


def create_action(
    db: Session,
    order: Order,
    type_: str,
    settings: dict,
    *,
    channel: str | None = None,
    experiment_group: str = "treatment",
    send: bool = True,
    actor: str = "system",
    at: datetime | None = None,
    publish: bool = True,
) -> Action:
    """Create (and for message actions, send) an intervention. Never cancels an order."""
    now = at or datetime.now()
    store = settings.get("store_name") or app_settings.default_store_name
    mcfg = settings.get("messaging", {})
    costs = settings.get("costs", {})
    if type_ == "CONFIRM_SMS":
        channel = "sms"
    elif type_ == "CONFIRM_WHATSAPP":
        channel = "whatsapp"
    elif type_ == "CONFIRM_CALL":
        channel = "call"
    elif type_ in ("PREPAID_NUDGE", "ADDRESS_VERIFY"):
        channel = channel if channel in ("whatsapp", "sms") else mcfg.get("default_channel", "whatsapp")
    else:
        channel = None

    a = Action(
        order_pk=order.id, seller_id=order.seller_id, type=type_, status="PENDING", channel=channel,
        kind=KIND_BY_TYPE.get(type_), experiment_group=experiment_group,
        cost=0.0, created_at=now, updated_at=now,
    )
    if type_ in KIND_BY_TYPE:
        a.token = secrets.token_urlsafe(16)
        a.expires_at = now + TOKEN_TTL
    link = f"{app_settings.public_base_url.rstrip('/')}/c/{a.token}" if a.token else None

    if type_ == "HOLDOUT_CONTROL":
        a.message = "Holdout control — no intervention sent (used to measure causal impact)."
        order.experiment_group = "control"
        audit(db, order.seller_id, order.id, "holdout", "Assigned to holdout control group (no intervention)", at=now)
    elif type_ == "MANUAL_REVIEW":
        a.message = "Queued for manual review before dispatch."
        a.cost = action_cost(type_, costs)
        order.status = "ON_HOLD"
        audit(db, order.seller_id, order.id, "manual_review", "Queued for manual review", actor=actor, at=now)
    elif type_ == "CONFIRM_CALL":
        a.message = (f"Call {order.customer_name or 'customer'} to confirm order {order.order_id} "
                     f"(₹{order.order_value:,.0f}, {order.payment_method}). Confirmation link: {link}")
        a.cost = action_cost(type_, costs)
        order.status = "ON_HOLD"
        audit(db, order.seller_id, order.id, "task", "Confirmation call queued for seller team", actor=actor, at=now)
    elif type_ in KIND_BY_TYPE:
        body = _render(KIND_BY_TYPE[type_], order, link or "", store, mcfg.get("language", "en"))
        a.message = body
        a.cost = action_cost(type_, costs, channel)
        if send:
            ok, prov, mid, err = _send(mcfg.get("provider", "mock"), order.customer_phone, channel or "whatsapp", body,
                                       {"order_id": order.order_id, "token": a.token, "kind": a.kind})
            a.provider, a.provider_message_id, a.error = prov, mid, err
            a.status = "SENT" if ok else "FAILED"
            if not ok:
                a.cost = 0.0
        else:
            a.status = "SENT"
            a.provider = mcfg.get("provider", "mock")
        if a.status == "SENT":
            order.status = "AWAITING_CUSTOMER"
        audit(db, order.seller_id, order.id, "action_sent" if a.status == "SENT" else "action_failed",
              f"{LABELS.get(type_, type_)} {'sent' if a.status == 'SENT' else 'failed'} via {channel}"
              + (f": {a.error}" if a.error else ""), actor=actor, at=now)
    if experiment_group == "treatment" and type_ != "HOLDOUT_CONTROL":
        order.experiment_group = order.experiment_group or "treatment"
    db.add(a)
    db.flush()
    if publish:
        broker.publish("action_updated", action_dict(a))
    return a


def open_action_for_order(db: Session, order_pk: int) -> Action | None:
    return db.scalar(
        select(Action).where(Action.order_pk == order_pk, Action.status.in_(OPEN_STATUSES))
        .order_by(Action.id.desc())
    )


def handle_response(
    db: Session,
    action: Action,
    response: str,
    *,
    address: str | None = None,
    pincode: str | None = None,
    at: datetime | None = None,
    publish: bool = True,
) -> dict[str, Any]:
    """Apply a customer's response from the confirmation page (or simulator)."""
    now = at or datetime.now()
    order = action.order
    if action.status in RESPONDED_STATUSES:
        return {"ok": False, "message": "You have already responded to this request. Thank you!"}
    if action.expires_at and now > action.expires_at and at is None:
        action.status = "EXPIRED"
        db.commit()
        return {"ok": False, "message": "This link has expired. Please contact the store."}
    if order.status in FINAL_ORDER_STATUSES:
        return {"ok": False, "message": f"This order can no longer be changed (status: {order.status.lower()})."}

    result: dict[str, Any] = {"ok": True}
    action.response = response
    action.response_data = {"address": address, "pincode": pincode} if response == "update_address" else None
    if response == "confirm":
        action.status = "CONFIRMED"
        order.status = "CONFIRMED"
        result["message"] = "Thank you! Your order is confirmed and will be dispatched soon."
    elif response == "cancel":
        action.status = "CANCELLED"
        order.status = "CANCELLED"
        result["message"] = "Your order has been cancelled. No charges apply."
    elif response == "convert_prepaid":
        action.status = "CONVERTED_PREPAID"
        order.status = "CONVERTED_PREPAID"
        order.payment_method = "PREPAID"
        result["message"] = "Great choice! Complete the payment to get priority dispatch."
        result["payment_link"] = f"{app_settings.public_base_url.rstrip('/')}/c/{action.token}?pay=mock"
    elif response == "update_address":
        action.status = "ADDRESS_UPDATED"
        if address:
            order.address = address.strip()
        if pincode:
            order.pincode = pincode
        order.status = "CONFIRMED"
        result["message"] = "Thanks! Your delivery address has been updated and your order is confirmed."
    else:
        return {"ok": False, "message": f"Unknown response '{response}'"}
    action.updated_at = now
    order.updated_at = now
    audit(db, order.seller_id, order.id, "customer_response", f"Customer responded: {response.replace('_', ' ')}",
          data=action.response_data, actor="customer", at=now)
    db.flush()
    if publish:
        broker.publish("action_updated", action_dict(action))
    return result


def public_view(action: Action, store_name: str) -> dict[str, Any]:
    o = action.order
    addr = (o.address or "").strip()
    masked = (addr[:6] + "…" + addr[-6:]) if len(addr) > 16 else (addr[:3] + "…" if addr else "")
    items = f"{o.quantity} × {(o.product_category or 'item').replace('_', ' ').title()}" + (f" ({o.sku})" if o.sku else "")
    expired = bool(action.expires_at and datetime.now() > action.expires_at) or action.status == "EXPIRED"
    return {
        "store_name": store_name,
        "order": {
            "order_id": o.order_id,
            "items": items,
            "order_value": round(float(o.order_value), 2),
            "payment_method": o.payment_method,
            "masked_address": masked,
            "city": o.city or "",
            "pincode": o.pincode,
        },
        "kind": action.kind or "confirm",
        "options": OPTIONS_BY_KIND.get(action.kind or "confirm", OPTIONS_BY_KIND["confirm"]),
        "expired": expired and action.status not in RESPONDED_STATUSES,
        "already_responded": action.status in RESPONDED_STATUSES,
        # extras
        "status": action.status,
        "customer_name": o.customer_name,
    }


__all__ = ["create_action", "handle_response", "public_view", "audit", "order_payload", "order_dict"]
