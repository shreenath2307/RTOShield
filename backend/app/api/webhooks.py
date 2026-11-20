from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.deps import current_seller
from app.core.config import settings
from app.db.models import Seller
from app.db.session import get_db
from app.services import scoring

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


async def _handle(request: Request, db: Session, seller: Seller, module, secret: str | None, header: str, source: str):
    raw = await request.body()
    sig = request.headers.get(header)
    if not module.verify_webhook(raw, sig, secret):
        raise HTTPException(401, "Invalid webhook signature")
    try:
        payload = json.loads(raw or b"{}")
    except ValueError:
        # WooCommerce sends a form-encoded ping when a webhook is created
        return {"ok": True, "message": "ping received"}
    if not isinstance(payload, dict) or not payload:
        return {"ok": True, "message": "empty payload ignored"}
    try:
        order = module.normalize_webhook(payload)
    except Exception as exc:
        raise HTTPException(422, f"Could not parse {source} order payload: {exc}")
    if not order.get("pincode"):
        raise HTTPException(422, "Order has no valid shipping pincode")
    res = await run_in_threadpool(scoring.score_orders, db, seller, [order], auto_action=True, source=source)
    return scoring.public(res[0])


@router.post("/shopify/orders-create")
async def shopify_orders_create(request: Request, db: Session = Depends(get_db),
                                seller: Seller = Depends(current_seller)):
    from app.integrations import shopify

    return await _handle(request, db, seller, shopify, settings.shopify_webhook_secret, "X-Shopify-Hmac-Sha256",
                         "shopify")


@router.post("/woocommerce/order-created")
async def woo_order_created(request: Request, db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    from app.integrations import woocommerce

    return await _handle(request, db, seller, woocommerce, settings.woo_webhook_secret, "X-WC-Webhook-Signature",
                         "woocommerce")
