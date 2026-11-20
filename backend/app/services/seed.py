"""Demo seeding: synthetic history -> train -> a resolved pilot period -> recent live orders."""
from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Any

import numpy as np
from sqlalchemy import func, select

from app.core.config import settings as app_settings
from app.core.logging import get_logger
from app.db.models import Action, Order
from app.db.session import session_scope

log = get_logger("seed")

SEED_STATE: dict[str, Any] = {"status": "idle", "step": None, "error": None, "started_at": None, "finished_at": None}

PILOT_DAYS = 21


def _set(status: str | None = None, step: str | None = None, **kw) -> None:
    if status:
        SEED_STATE["status"] = status
    if step is not None:
        SEED_STATE["step"] = step
    SEED_STATE.update(kw)
    if step:
        log.info("seed: %s", step)


def demo_history(n: int, now: datetime | None = None, seed: int = 42):
    """Synthetic labelled history ending just before the pilot window."""
    from app.data.synthetic import generate_orders

    now = now or datetime.now()
    days = 395
    start = (now - timedelta(days=days + PILOT_DAYS)).strftime("%Y-%m-%d")
    return generate_orders(n=n, seed=seed, start=start, days=days)


def run_pilot(seller_id: str, n_pilot: int, n_live: int, seed: int = 7) -> dict:
    """Generate pilot (resolved) + recent live orders through the real scoring/action pipeline."""
    from app.data.synthetic import generate_live_order
    from app.services.simulator import apply_outcome, apply_response, plan_for
    from app.services.scoring import score_orders
    from app.services.sellers import get_or_create_seller, seller_settings

    rng = np.random.default_rng(seed)
    now = datetime.now().replace(microsecond=0)
    pilot_start = now - timedelta(days=PILOT_DAYS)
    # pilot orders: placed between pilot_start and now-2d (old enough to be resolved)
    span = (PILOT_DAYS - 2) * 86400
    pilot_times = sorted(pilot_start + timedelta(seconds=float(s)) for s in rng.uniform(0, span, n_pilot))
    live_times = sorted(now - timedelta(seconds=float(s)) for s in rng.uniform(60, 36 * 3600, n_live))
    stats = {"pilot": 0, "live": 0}
    for phase, times in (("pilot", pilot_times), ("live", live_times)):
        for i in range(0, len(times), 200):
            batch_t = times[i:i + 200]
            orders = [generate_live_order(rng, t) for t in batch_t]
            with session_scope() as db:
                seller = get_or_create_seller(db, seller_id)
                settings = seller_settings(seller)
                results = score_orders(db, seller, orders, auto_action=True, source="seed", publish=False,
                                       send_messages=False, backdate=True, commit=False)
                for r in results:
                    o: Order = r["_order"]
                    a: Action | None = r["_action"]
                    plan = plan_for(a.type if a else None, o.payment_method, float(o.risk_probability or 0), rng)
                    placed = o.order_date
                    if phase == "pilot":
                        apply_response(db, o, a, plan, settings, placed + timedelta(hours=float(rng.uniform(0.2, 8))),
                                       publish=False)
                        apply_outcome(db, o, plan, placed + timedelta(days=float(rng.uniform(2, 6))), publish=False)
                    else:
                        # some live customers already responded
                        if a is not None and plan.response is not None and rng.random() < 0.45:
                            rt = min(now, placed + timedelta(minutes=float(rng.uniform(5, 180))))
                            apply_response(db, o, a, plan, settings, rt, publish=False)
                db.flush()
            stats[phase] += len(orders)
    return stats


def seed_demo(force: bool = False) -> None:
    """Idempotent: does nothing if the DB already has orders (unless ``force``)."""
    from app.services.ingest import basic_report, import_orders
    from app.services.sellers import get_or_create_seller
    from app.services.training import train_model

    t0 = time.time()
    SEED_STATE.update(status="running", error=None, started_at=datetime.now().isoformat(), finished_at=None)
    try:
        sid = app_settings.default_seller_id
        with session_scope() as db:
            seller = get_or_create_seller(db, sid)
            n = db.scalar(select(func.count(Order.id)).where(Order.seller_id == sid)) or 0
            if n and not force:
                _set("done", "skipped (database already has orders)", finished_at=datetime.now().isoformat())
                return
            _set(step=f"generating {app_settings.seed_historical_n} synthetic historical orders")
            df = demo_history(app_settings.seed_historical_n)
            _set(step="importing historical orders")
            import_orders(db, sid, df, source="demo", source_format="canonical", column_map={c: c for c in df.columns},
                          report=basic_report(df), filename="synthetic_demo.csv", is_historical=True)
            _set(step="training model")
            try:
                train_model(db, seller)
            except Exception as exc:
                log.warning("seed training failed (%s); continuing with cold-start model", exc)
        _set(step=f"simulating {app_settings.seed_pilot_n} pilot orders + {app_settings.seed_live_n} live orders")
        stats = run_pilot(sid, app_settings.seed_pilot_n, app_settings.seed_live_n)
        _set("done", f"seeded in {time.time() - t0:.1f}s ({stats})", finished_at=datetime.now().isoformat())
    except Exception as exc:  # pragma: no cover
        log.exception("seeding failed")
        _set("error", "failed", error=str(exc), finished_at=datetime.now().isoformat())
