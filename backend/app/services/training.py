"""Train / activate model versions."""
from __future__ import annotations

import threading
from datetime import datetime
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.core.events import broker
from app.core.jsonsafe import json_safe
from app.core.logging import get_logger
from app.db.models import AuditLog, ModelVersion, Seller
from app.services.ingest import orders_frame
from app.services.model_registry import registry
from app.services.sellers import seller_settings

log = get_logger("training")
_train_lock = threading.Lock()


def train_model(db: Session, seller: Seller) -> dict:
    from app.ml.trainer import train

    with _train_lock:
        df = orders_frame(db, seller.id, labelled_only=True)
        df = df.sort_values("order_date").reset_index(drop=True)
        settings = seller_settings(seller)
        art_dir = Path(app_settings.artifact_dir) / seller.id
        art_dir.mkdir(parents=True, exist_ok=True)
        report = train(df, seller.id, art_dir, {"costs": settings.get("costs"), "thresholds": settings.get("thresholds")})
        report = json_safe(report)
        version = str(report.get("version"))
        db.execute(update(ModelVersion).where(ModelVersion.seller_id == seller.id).values(is_active=False))
        existing = db.scalar(select(ModelVersion).where(ModelVersion.version == version))
        if existing is not None:  # extremely unlikely: same-minute version string
            version = f"{version}-{datetime.now().strftime('%S%f')[:4]}"
            report["version"] = version
        trained_at = report.get("trained_at")
        try:
            ta = datetime.fromisoformat(trained_at) if trained_at else datetime.now()
            if ta.tzinfo is not None:
                ta = ta.replace(tzinfo=None)
        except Exception:
            ta = datetime.now()
        mv = ModelVersion(
            seller_id=seller.id, version=version, trained_at=ta, algorithm=report.get("algorithm"),
            report=report, artifact_path=str(report.get("artifact_path") or ""), is_active=True,
            n_train=int(report.get("n_train") or 0),
        )
        db.add(mv)
        db.add(AuditLog(seller_id=seller.id, kind="model_trained",
                        text=f"Model {version} trained on {report.get('n_train')} orders "
                             f"(ROC-AUC {report.get('metrics', {}).get('roc_auc')})"))
        db.commit()
        registry.invalidate(seller.id)
        log.info("trained %s auc=%s", version, report.get("metrics", {}).get("roc_auc"))
    broker.publish("model_trained", report)
    return report


def activate(db: Session, seller: Seller, version: str) -> bool:
    mv = db.scalar(select(ModelVersion).where(ModelVersion.seller_id == seller.id, ModelVersion.version == version))
    if mv is None:
        return False
    db.execute(update(ModelVersion).where(ModelVersion.seller_id == seller.id).values(is_active=False))
    mv.is_active = True
    db.commit()
    registry.invalidate(seller.id)
    return True
