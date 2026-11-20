from __future__ import annotations

import io

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import current_seller
from app.core.jsonsafe import json_safe
from app.db.models import Seller
from app.db.session import get_db
from app.schemas.api import ShopifySyncIn, WooSyncIn
from app.services.ingest import basic_report, import_orders
from app.services.training import train_model

router = APIRouter(prefix="/ingest", tags=["ingest"])

MAX_UPLOAD_BYTES = 50 * 1024 * 1024


def read_upload_csv(content: bytes, filename: str | None) -> pd.DataFrame:
    if not content:
        raise HTTPException(422, "Uploaded file is empty")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File too large (max 50 MB)")
    name = (filename or "").lower()
    try:
        if name.endswith((".xlsx", ".xls")):
            return pd.read_excel(io.BytesIO(content), dtype=str)
        for enc in ("utf-8-sig", "latin-1"):
            try:
                df = pd.read_csv(io.BytesIO(content), dtype=str, encoding=enc)
                if df.shape[1] == 1:  # maybe ; or tab separated
                    df2 = pd.read_csv(io.BytesIO(content), dtype=str, encoding=enc, sep=None, engine="python")
                    if df2.shape[1] > 1:
                        df = df2
                return df
            except UnicodeDecodeError:
                continue
    except pd.errors.EmptyDataError:
        raise HTTPException(422, "CSV has no rows")
    except Exception as exc:
        raise HTTPException(422, f"Could not parse file as CSV: {exc}")
    raise HTTPException(422, "Could not decode file (expected UTF-8 CSV)")


def map_frame(df_raw: pd.DataFrame):
    from app.integrations.csv_mapper import detect_and_map

    if df_raw.empty:
        raise HTTPException(422, "CSV has a header but no data rows")
    try:
        res = detect_and_map(df_raw)
    except Exception as exc:
        raise HTTPException(422, f"Could not map CSV columns: {exc}")
    if res.df is None or len(res.df) == 0:
        raise HTTPException(422, {"message": "No valid orders found after cleaning. Check that the file has order id, "
                                             "date, pincode, amount and payment columns.",
                                  "source_format": res.source_format, "column_map": res.column_map,
                                  "report": json_safe(res.report)})
    return res


@router.post("/csv")
def ingest_csv(file: UploadFile = File(...), db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    content = file.file.read()
    df_raw = read_upload_csv(content, file.filename)
    res = map_frame(df_raw)
    return import_orders(db, seller.id, res.df, source="csv", source_format=res.source_format,
                         column_map=res.column_map, report=res.report, filename=file.filename, is_historical=True)


@router.post("/demo")
def ingest_demo(n: int = Query(8000, ge=200, le=50000), train: bool = True, seed: int = 42,
                db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    from app.services.seed import demo_history

    df = demo_history(n, seed=seed)
    out = import_orders(db, seller.id, df, source="demo", source_format="canonical",
                        column_map={c: c for c in df.columns}, report=basic_report(df),
                        filename="synthetic_demo.csv", is_historical=True)
    if train:
        try:
            out["train_report"] = train_model(db, seller)
        except ValueError as exc:
            raise HTTPException(422, f"Imported {out['rows_imported']} rows but training failed: {exc}")
    return out


async def _sync(fetch, seller: Seller, db: Session, source: str, **kw):
    from app.integrations import IntegrationError
    from starlette.concurrency import run_in_threadpool

    try:
        df = await fetch(**kw)
    except IntegrationError as exc:
        raise HTTPException(502, f"{source.title()} sync failed: {exc.msg}")
    except Exception as exc:
        raise HTTPException(502, f"{source.title()} sync failed: {exc}")
    if df is None or len(df) == 0:
        raise HTTPException(422, f"No orders returned from {source.title()}")
    return await run_in_threadpool(import_orders, db, seller.id, df, source=source, source_format=source,
                                   column_map={}, report=basic_report(df), filename=None, is_historical=True)


@router.post("/shopify/sync")
async def shopify_sync(body: ShopifySyncIn, db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    from app.integrations.shopify import fetch_orders

    return await _sync(fetch_orders, seller, db, "shopify", store_url=body.store_url, access_token=body.access_token)


@router.post("/woocommerce/sync")
async def woo_sync(body: WooSyncIn, db: Session = Depends(get_db), seller: Seller = Depends(current_seller)):
    from app.integrations.woocommerce import fetch_orders

    return await _sync(fetch_orders, seller, db, "woocommerce", store_url=body.store_url,
                       access_token=body.consumer_key, consumer_secret=body.consumer_secret)
