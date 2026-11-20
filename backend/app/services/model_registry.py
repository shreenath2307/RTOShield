"""Active-model cache. Falls back to the transparent cold-start scorer."""
from __future__ import annotations

import threading
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.db.models import ModelVersion

log = get_logger("registry")


class ModelRegistry:
    def __init__(self) -> None:
        self._cache: dict[str, object] = {}
        self._lock = threading.Lock()

    def get(self, db: Session, seller_id: str):
        from app.ml.scorer import RiskScorer

        with self._lock:
            sc = self._cache.get(seller_id)
            if sc is not None:
                return sc
        mv = db.scalar(
            select(ModelVersion)
            .where(ModelVersion.seller_id == seller_id, ModelVersion.is_active.is_(True))
            .order_by(ModelVersion.id.desc())
        )
        scorer = None
        if mv is not None and mv.artifact_path and Path(mv.artifact_path).exists():
            try:
                scorer = RiskScorer.load(mv.artifact_path)
            except Exception as exc:  # corrupt / incompatible artifact
                log.warning("Failed to load model %s (%s); using cold start", mv.version, exc)
        if scorer is None:
            scorer = RiskScorer.cold_start()
        with self._lock:
            self._cache[seller_id] = scorer
        return scorer

    def invalidate(self, seller_id: str | None = None) -> None:
        with self._lock:
            if seller_id is None:
                self._cache.clear()
            else:
                self._cache.pop(seller_id, None)

    def active_version(self, db: Session, seller_id: str) -> ModelVersion | None:
        return db.scalar(
            select(ModelVersion)
            .where(ModelVersion.seller_id == seller_id, ModelVersion.is_active.is_(True))
            .order_by(ModelVersion.id.desc())
        )


registry = ModelRegistry()
