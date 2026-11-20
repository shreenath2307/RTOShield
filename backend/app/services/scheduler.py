"""Background retrain / drift-check loop (asyncio)."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

from sqlalchemy import select

from app.core.config import settings as app_settings
from app.core.logging import get_logger
from app.db.models import AuditLog, Seller
from app.db.session import session_scope
from app.services.model_registry import registry
from app.services.seed import SEED_STATE

log = get_logger("scheduler")

STATE: dict = {"last_check": None, "last_result": None}


def check_once() -> list[dict]:
    from app.services.monitoring import drift
    from app.services.sellers import seller_settings
    from app.services.training import train_model

    results = []
    with session_scope() as db:
        for seller in db.scalars(select(Seller)).all():
            cfg = seller_settings(seller).get("retrain", {})
            res: dict = {"seller_id": seller.id, "retrained": False, "reason": None}
            if not cfg.get("auto", True):
                res["reason"] = "auto retrain disabled"
                results.append(res)
                continue
            mv = registry.active_version(db, seller.id)
            reason = None
            if mv is None:
                reason = "no trained model"
            elif datetime.now() - mv.trained_at > timedelta(days=float(cfg.get("schedule_days", 7))):
                reason = f"model older than {cfg.get('schedule_days')} days"
            else:
                try:
                    d = drift(db, seller)
                    psi = float(d.get("overall_psi") or 0)
                    res["psi"] = psi
                    if psi > float(cfg.get("drift_psi_threshold", 0.2)):
                        reason = f"drift PSI {psi:.3f} above threshold"
                except ValueError:
                    pass
            if reason:
                try:
                    rep = train_model(db, seller)
                    res.update(retrained=True, reason=reason, version=rep.get("version"))
                    db.add(AuditLog(seller_id=seller.id, kind="auto_retrain", text=f"Auto-retrained: {reason}"))
                except ValueError as exc:
                    res["reason"] = f"{reason}; retrain skipped: {exc}"
            results.append(res)
    STATE["last_check"] = datetime.now().isoformat()
    STATE["last_result"] = results
    return results


async def scheduler_loop(initial_delay: float = 600.0) -> None:
    await asyncio.sleep(initial_delay)
    while True:
        if SEED_STATE.get("status") != "running":
            try:
                res = await asyncio.to_thread(check_once)
                log.info("scheduled check: %s", res)
            except Exception as exc:
                log.warning("scheduled check failed: %s", exc)
        await asyncio.sleep(max(60, app_settings.scheduler_interval_sec))
