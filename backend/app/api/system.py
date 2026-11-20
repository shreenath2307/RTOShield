"""Health, settings, SSE stream, simulator and benchmark endpoints."""
from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from app.api.deps import current_seller
from app.core.events import broker
from app.db.models import Order, Seller
from app.db.session import get_db
from app.schemas.api import SimulateIn
from app.services.model_registry import registry
from app.services.seed import SEED_STATE
from app.services.sellers import seller_settings, update_seller_settings
from app.services.simulator import simulator

router = APIRouter(tags=["system"])


@router.get("/health")
def health(db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    scorer = registry.get(db, seller.id)
    n = db.scalar(select(func.count(Order.id)).where(Order.seller_id == seller.id)) or 0
    return {
        "status": "ok",
        "model_version": scorer.version,
        "cold_start": bool(scorer.is_cold_start),
        "orders": int(n),
        "seeding": SEED_STATE.get("status"),
        "seeding_step": SEED_STATE.get("step"),
        "seeding_error": SEED_STATE.get("error"),
        "simulator_running": simulator.running,
    }


@router.get("/settings")
def get_settings(seller: Seller = Depends(current_seller)):
    return seller_settings(seller)


@router.put("/settings")
def put_settings(patch: dict[str, Any] = Body(...), db: Session = Depends(get_db),
                 seller: Seller = Depends(current_seller)):
    try:
        return update_seller_settings(db, seller, patch)
    except ValidationError as exc:
        errs = "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors())
        raise HTTPException(422, f"Invalid settings: {errs}")


@router.get("/stream/events")
async def stream(request: Request):
    q = broker.subscribe()

    async def gen():
        try:
            yield {"data": json.dumps({"type": "hello", "data": {"subscribers": broker.subscriber_count}})}
            while True:
                if await request.is_disconnected():
                    break
                try:
                    evt = await asyncio.wait_for(q.get(), timeout=15)
                except asyncio.TimeoutError:
                    continue  # sse-starlette sends ping comments
                yield {"data": json.dumps(evt, ensure_ascii=False)}
        finally:
            broker.unsubscribe(q)

    return EventSourceResponse(gen(), ping=10, headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/simulate/start")
async def sim_start(body: SimulateIn | None = None, seller: Seller = Depends(current_seller)):
    body = body or SimulateIn()
    simulator.seller_id = seller.id
    return await simulator.start(body.rate_per_min, body.resolve_outcomes)


@router.post("/simulate/stop")
async def sim_stop():
    return await simulator.stop()


@router.get("/simulate/status")
def sim_status():
    return simulator.status()


@router.get("/benchmarks/pincode/{pincode}")
def pincode(pincode: str):
    from app.core.jsonsafe import json_safe
    from app.data.benchmarks import pincode_meta

    pin = "".join(ch for ch in pincode if ch.isdigit())
    if len(pin) < 3:
        raise HTTPException(422, "Provide at least the first 3 digits of the pincode")
    return json_safe(pincode_meta(pin))
