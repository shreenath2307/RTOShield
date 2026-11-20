from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import current_seller
from app.db.models import Seller
from app.db.session import get_db
from app.services import analytics, impact
from app.services.model_registry import registry
from app.services.sellers import seller_settings

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/summary")
def summary(db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    scorer = registry.get(db, seller.id)
    try:
        net = impact.compute(db, seller.id, seller_settings(seller))["costs"]["net_saved"]
    except Exception:
        net = 0.0
    return analytics.summary(db, seller.id, net, scorer.version, bool(scorer.is_cold_start))


@router.get("/dashboard/trend")
def trend(granularity: Literal["week", "month"] = "week", db: Session = Depends(get_db),
          seller: Seller = Depends(current_seller)):
    return analytics.trend(db, seller.id, granularity)


@router.get("/dashboard/top-risk")
def top_risk(by: Literal["pincode", "category", "state", "city"] = "pincode", limit: int = Query(10, ge=1, le=100),
             db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    return analytics.top_risk(db, seller.id, by, limit)


@router.get("/dashboard/heatmap")
def heatmap(db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    return analytics.heatmap(db, seller.id)


@router.get("/impact/report")
def impact_report(db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    return impact.compute(db, seller.id, seller_settings(seller))


@router.get("/impact/report.csv")
def impact_csv(db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    rep = impact.compute(db, seller.id, seller_settings(seller))
    return Response(
        content=impact.to_csv(rep),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="rto_shield_impact_report.csv"'},
    )
