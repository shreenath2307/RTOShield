"""Live order simulator + stochastic customer/outcome model (demo only).

Each simulated order draws a latent ``would_rto ~ Bernoulli(p)`` from the model's
predicted probability. Interventions change what happens:

* would-RTO customer who receives an intervention: ~22% cancel before dispatch,
  ~10% are "rescued" (confirm / convert to prepaid / fix address and then accept),
  the rest either ignore the message or confirm and still refuse delivery.
* genuine customers mostly confirm; ~2% cancel (friction).
* holdout control / NONE orders get no intervention, so they RTO at the natural rate.

This produces a measurable treatment-vs-control difference in the impact report.
It is a simulation, not evidence of real-world performance.
"""
from __future__ import annotations

import asyncio
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta

import numpy as np
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.db.models import Action, Order
from app.db.session import session_scope
from app.services.actions import handle_response
from app.services.orders import decide, set_outcome
from app.services.scoring import score_orders
from app.services.sellers import get_or_create_seller, seller_settings

log = get_logger("simulator")

MESSAGE_TYPES = {"CONFIRM_WHATSAPP", "CONFIRM_SMS", "CONFIRM_CALL", "PREPAID_NUDGE", "ADDRESS_VERIFY"}
P_CANCEL_RTO, P_RESCUE_RTO, P_IGNORE_RTO = 0.22, 0.10, 0.38


@dataclass
class Plan:
    would_rto: bool
    response: str | None  # confirm | cancel | convert_prepaid | update_address | approve | hold | None
    rescued: bool


def plan_for(action_type: str | None, payment_method: str, p: float, rng: np.random.Generator) -> Plan:
    would_rto = bool(rng.random() < p)
    if action_type in MESSAGE_TYPES:
        r = rng.random()
        if would_rto:
            if r < P_CANCEL_RTO:
                return Plan(True, "cancel", False)
            if r < P_CANCEL_RTO + P_RESCUE_RTO:
                if action_type == "PREPAID_NUDGE" and payment_method == "COD":
                    resp = "convert_prepaid"
                elif action_type == "ADDRESS_VERIFY":
                    resp = "update_address"
                else:
                    resp = "confirm"
                return Plan(True, resp, True)
            if r < P_CANCEL_RTO + P_RESCUE_RTO + P_IGNORE_RTO:
                return Plan(True, None, False)
            return Plan(True, "confirm", False)
        if r < 0.02:
            return Plan(False, "cancel", False)
        if action_type == "PREPAID_NUDGE" and payment_method == "COD" and r < 0.30:
            return Plan(False, "convert_prepaid", False)
        if r < 0.78:
            return Plan(False, "update_address" if action_type == "ADDRESS_VERIFY" and r < 0.2 else "confirm", False)
        return Plan(False, None, False)
    if action_type == "MANUAL_REVIEW":
        if would_rto and rng.random() < 0.25:
            return Plan(True, "cancel", False)
        return Plan(would_rto, "approve", False)
    return Plan(would_rto, None, False)


def apply_response(db: Session, order: Order, action: Action | None, plan: Plan, settings: dict,
                   at: datetime, publish: bool) -> None:
    if plan.response is None or action is None:
        return
    if action.type == "MANUAL_REVIEW":
        decide(db, order, plan.response, settings, note="(simulated seller review)", actor="simulator", at=at,
               publish=publish)
        return
    addr = None
    pin = None
    if plan.response == "update_address":
        addr = (order.address or "") + ", near main landmark (verified)"
        pin = order.pincode
    handle_response(db, action, plan.response, address=addr, pincode=pin, at=at, publish=publish)


def apply_outcome(db: Session, order: Order, plan: Plan, at: datetime, publish: bool) -> None:
    if order.status == "CANCELLED":
        return
    outcome = "RTO" if (plan.would_rto and not plan.rescued) else "DELIVERED"
    set_outcome(db, order, outcome, at=at, publish=publish, commit=False)


@dataclass
class _Pending:
    due: float
    kind: str  # response | outcome
    order_pk: int
    action_pk: int | None
    plan: Plan


@dataclass
class Simulator:
    running: bool = False
    rate_per_min: float = 20.0
    resolve_outcomes: bool = True
    generated: int = 0
    seller_id: str | None = None
    _task: asyncio.Task | None = None
    _pending: list[_Pending] = field(default_factory=list)
    _lock: threading.Lock = field(default_factory=threading.Lock)
    _rng: np.random.Generator = field(default_factory=lambda: np.random.default_rng())

    def status(self) -> dict:
        return {"running": self.running, "rate_per_min": self.rate_per_min, "generated": self.generated,
                "resolve_outcomes": self.resolve_outcomes, "pending_events": len(self._pending)}

    async def start(self, rate_per_min: float, resolve_outcomes: bool) -> dict:
        self.rate_per_min = float(rate_per_min)
        self.resolve_outcomes = bool(resolve_outcomes)
        if not self.running:
            self.running = True
            self._task = asyncio.create_task(self._run())
        return self.status()

    async def stop(self) -> dict:
        self.running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None
        return self.status()

    async def _run(self) -> None:
        log.info("simulator started at %.1f orders/min", self.rate_per_min)
        next_gen = time.monotonic()
        try:
            while self.running:
                now = time.monotonic()
                if now >= next_gen:
                    try:
                        await asyncio.to_thread(self._generate_one)
                    except Exception as exc:  # keep running
                        log.warning("simulator generate failed: %s", exc)
                    interval = 60.0 / max(self.rate_per_min, 0.1)
                    next_gen = now + float(self._rng.exponential(interval))
                if self._pending:
                    try:
                        await asyncio.to_thread(self._process_due)
                    except Exception as exc:
                        log.warning("simulator resolve failed: %s", exc)
                await asyncio.sleep(min(0.5, max(0.05, next_gen - time.monotonic())))
        except asyncio.CancelledError:
            pass
        finally:
            self.running = False
            log.info("simulator stopped (generated=%d)", self.generated)

    def _generate_one(self) -> None:
        from app.data.synthetic import generate_live_order

        order = generate_live_order(self._rng, datetime.now())
        with session_scope() as db:
            seller = get_or_create_seller(db, self.seller_id)
            res = score_orders(db, seller, [order], auto_action=True, source="simulator")[0]
            self.generated += 1
            if not self.resolve_outcomes:
                return
            o: Order = res["_order"]
            a: Action | None = res["_action"]
            plan = plan_for(a.type if a is not None else None, o.payment_method, float(o.risk_probability or 0.0),
                            self._rng)
            t = time.monotonic()
            with self._lock:
                if a is not None and plan.response is not None:
                    self._pending.append(_Pending(t + float(self._rng.uniform(3, 12)), "response", o.id, a.id, plan))
                self._pending.append(_Pending(t + float(self._rng.uniform(20, 60)), "outcome", o.id, None, plan))

    def _process_due(self) -> None:
        t = time.monotonic()
        with self._lock:
            due = [p for p in self._pending if p.due <= t]
            self._pending = [p for p in self._pending if p.due > t]
        if not due:
            return
        with session_scope() as db:
            seller = get_or_create_seller(db, self.seller_id)
            settings = seller_settings(seller)
            for p in sorted(due, key=lambda x: x.kind != "response"):
                order = db.get(Order, p.order_pk)
                if order is None:
                    continue
                if p.kind == "response":
                    action = db.get(Action, p.action_pk) if p.action_pk else None
                    try:
                        apply_response(db, order, action, p.plan, settings, datetime.now(), publish=True)
                    except ValueError:
                        pass
                elif order.outcome is None:
                    if order.status in ("AWAITING_CUSTOMER", "ON_HOLD", "SCORED", "CONFIRMED", "CONVERTED_PREPAID",
                                        "APPROVED"):
                        apply_outcome(db, order, p.plan, datetime.now(), publish=True)
            db.commit()


simulator = Simulator()
