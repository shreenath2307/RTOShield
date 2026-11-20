from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import current_seller
from app.core.jsonsafe import json_safe
from app.db.models import ModelVersion, Seller
from app.db.session import get_db
from app.services import monitoring, training
from app.services.model_registry import registry
from app.services.scoring import n_labelled

router = APIRouter(prefix="/model", tags=["model"])


@router.post("/train")
def train(db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    try:
        return training.train_model(db, seller)
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@router.get("/active")
def active(db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    scorer = registry.get(db, seller.id)
    mv = registry.active_version(db, seller.id)
    report = mv.report if (mv is not None and not scorer.is_cold_start and mv.version == scorer.version) else None
    return json_safe({
        "version": scorer.version,
        "cold_start": bool(scorer.is_cold_start),
        "report": report,
        "n_labelled": n_labelled(db, seller.id, fresh=True),
        "algorithm": getattr(scorer, "algorithm", None),
    })


@router.get("/versions")
def versions(db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    rows = db.scalars(select(ModelVersion).where(ModelVersion.seller_id == seller.id)
                      .order_by(ModelVersion.id.desc())).all()
    return json_safe([{
        "version": m.version, "trained_at": m.trained_at, "metrics": (m.report or {}).get("metrics", {}),
        "is_active": bool(m.is_active), "algorithm": m.algorithm, "n_train": m.n_train,
    } for m in rows])


@router.post("/activate/{version}")
def activate(version: str, db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    if not training.activate(db, seller, version):
        raise HTTPException(404, f"Model version '{version}' not found")
    return {"ok": True}


@router.get("/drift")
def drift(db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    try:
        return monitoring.drift(db, seller)
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@router.get("/fairness")
def fairness(db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    try:
        return monitoring.fairness(db, seller)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
