from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import current_seller
from app.api.ingest import map_frame, read_upload_csv
from app.db.models import Seller
from app.db.session import get_db
from app.schemas.api import OrderIn, WhatIfIn
from app.services import scoring

router = APIRouter(prefix="/score", tags=["score"])

ALLOWED_CHANGES = {"order_value", "payment_method", "pincode", "product_category", "quantity", "address", "order_date",
                   "channel", "city", "state", "customer_id", "customer_phone", "sku"}
MAX_BATCH = 5000


@router.post("")
def score(order: OrderIn, auto_action: bool = True, db: Session = Depends(get_db),
          seller: Seller = Depends(current_seller)):
    res = scoring.score_orders(db, seller, [order.model_dump()], auto_action=auto_action, source=order.channel)
    return scoring.public(res[0])


@router.post("/what-if")
def what_if(body: WhatIfIn, db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    changes = {k: v for k, v in (body.changes or {}).items() if k in ALLOWED_CHANGES and v is not None}
    if "payment_method" in changes:
        changes["payment_method"] = str(changes["payment_method"]).upper()
    if "pincode" in changes:
        pin = "".join(ch for ch in str(changes["pincode"]) if ch.isdigit())
        if len(pin) != 6:
            raise HTTPException(422, "changes.pincode must be 6 digits")
        changes["pincode"] = pin
    if "order_value" in changes:
        try:
            changes["order_value"] = float(changes["order_value"])
        except (TypeError, ValueError):
            raise HTTPException(422, "changes.order_value must be a number")
    if "quantity" in changes:
        changes["quantity"] = int(changes["quantity"])
    return scoring.what_if(db, seller, body.order.model_dump(), changes)


@router.post("/batch")
def batch(file: UploadFile = File(...), auto_action: bool = Query(False), db: Session = Depends(get_db),
          seller: Seller = Depends(current_seller)):
    df_raw = read_upload_csv(file.file.read(), file.filename)
    res = map_frame(df_raw)
    df = res.df
    if len(df) > MAX_BATCH:
        raise HTTPException(413, f"Batch too large ({len(df)} rows); max {MAX_BATCH}")
    d = df.drop(columns=["outcome"], errors="ignore")
    recs = d.astype(object).where(d.notna(), None).to_dict("records")
    for r in recs:
        if r.get("order_date") is not None and hasattr(r["order_date"], "to_pydatetime"):
            r["order_date"] = r["order_date"].to_pydatetime()
    items = []
    for i in range(0, len(recs), 500):
        out = scoring.score_orders(db, seller, recs[i:i + 500], auto_action=auto_action, source="batch",
                                   publish=len(recs) <= 50)
        items.extend(scoring.public(r) for r in out)
    summary = {"low": 0, "medium": 0, "high": 0}
    for it in items:
        summary[it["prediction"]["tier"]] = summary.get(it["prediction"]["tier"], 0) + 1
    return {"items": items, "summary": summary, "report": res.report, "source_format": res.source_format}
