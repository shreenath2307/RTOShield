"""Bulk import of canonical order DataFrames + data access helpers."""
from __future__ import annotations

from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.core.jsonsafe import json_safe
from app.db.models import Order, Upload
from app.services.scoring import invalidate_labelled

CANON_COLS = ["order_id", "order_date", "customer_id", "customer_phone", "customer_name", "pincode", "city", "state",
              "address", "order_value", "payment_method", "product_category", "sku", "quantity", "channel", "outcome"]


def _clean_records(df: pd.DataFrame) -> list[dict[str, Any]]:
    df = df.copy()
    for c in CANON_COLS:
        if c not in df.columns:
            df[c] = None
    df = df[CANON_COLS]
    df["order_date"] = pd.to_datetime(df["order_date"], errors="coerce")
    df = df[df["order_date"].notna()]
    if getattr(df["order_date"].dt, "tz", None) is not None:
        df["order_date"] = df["order_date"].dt.tz_convert("Asia/Kolkata").dt.tz_localize(None)
    df["order_value"] = pd.to_numeric(df["order_value"], errors="coerce").fillna(0.0).astype(float)
    df["quantity"] = pd.to_numeric(df["quantity"], errors="coerce").fillna(1).astype(int)
    dates = [d.to_pydatetime() for d in df["order_date"]]
    obj = df.drop(columns=["order_date"]).astype(object)
    obj = obj.where(pd.notna(obj), None)
    recs = obj.to_dict("records")
    for r, d in zip(recs, dates):
        r["order_date"] = d
        for k in ("order_id", "customer_id", "pincode", "customer_phone", "sku"):
            if r.get(k) is not None:
                r[k] = str(r[k])
        r["order_value"] = float(r["order_value"])
        r["quantity"] = int(r["quantity"])
        r["payment_method"] = str(r.get("payment_method") or "COD").upper()
        r["product_category"] = str(r.get("product_category") or "other")
        r["channel"] = str(r.get("channel") or "manual")
        if not r.get("customer_id"):
            r["customer_id"] = f"cust-{r['customer_phone'] or r['order_id']}"
        if r.get("outcome") not in ("DELIVERED", "RTO"):
            r["outcome"] = None
    return [r for r in recs if r.get("order_id") and r.get("pincode")]


def import_orders(
    db: Session,
    seller_id: str,
    df: pd.DataFrame,
    *,
    source: str,
    source_format: str | None = None,
    column_map: dict | None = None,
    report: dict | None = None,
    filename: str | None = None,
    is_historical: bool = True,
) -> dict[str, Any]:
    recs = _clean_records(df)
    # dedupe within file + against DB
    seen: set[str] = set()
    uniq = []
    for r in recs:
        if r["order_id"] in seen:
            continue
        seen.add(r["order_id"])
        uniq.append(r)
    existing: set[str] = set()
    ids = [r["order_id"] for r in uniq]
    for i in range(0, len(ids), 900):
        existing.update(db.scalars(select(Order.order_id).where(Order.seller_id == seller_id,
                                                                Order.order_id.in_(ids[i:i + 900]))).all())
    new = [r for r in uniq if r["order_id"] not in existing]
    up = Upload(seller_id=seller_id, filename=filename, source=source, source_format=source_format,
                column_map=json_safe(column_map or {}), report=json_safe(report or {}))
    db.add(up)
    db.flush()
    now = datetime.now()
    rows = []
    for r in new:
        rows.append({
            **r,
            "seller_id": seller_id,
            "status": r["outcome"] or ("NEW" if not is_historical else "SHIPPED"),
            "is_historical": is_historical,
            "source": source,
            "upload_id": up.id,
            "created_at": now,
            "updated_at": now,
            "outcome_at": now if r["outcome"] else None,
            "risk_probability": None, "risk_tier": None, "recommended_action": None, "recommendation": None,
            "experiment_group": None, "external_id": None,
        })
    for i in range(0, len(rows), 2000):
        db.execute(insert(Order), rows[i:i + 2000])
    labelled = sum(1 for r in new if r["outcome"])
    up.rows_imported = len(new)
    up.labelled_rows = labelled
    db.commit()
    invalidate_labelled(seller_id)
    rep = dict(report or {})
    if existing:
        rep.setdefault("warnings", [])
        rep["warnings"] = list(rep["warnings"]) + [f"{len(existing)} orders already existed and were skipped"]
    rep["duplicates_skipped"] = len(existing)
    return json_safe({
        "upload_id": up.id,
        "source_format": source_format or "unknown",
        "column_map": column_map or {},
        "report": rep,
        "rows_imported": len(new),
        "labelled_rows": labelled,
    })


def basic_report(df: pd.DataFrame) -> dict[str, Any]:
    out = df.get("outcome")
    dist = {"DELIVERED": 0, "RTO": 0, "unknown": 0}
    if out is not None:
        vc = out.fillna("unknown").value_counts()
        for k, v in vc.items():
            dist[k if k in dist else "unknown"] += int(v)
    dr = None
    if "order_date" in df and len(df):
        d = pd.to_datetime(df["order_date"], errors="coerce")
        if d.notna().any():
            dr = [d.min().isoformat(), d.max().isoformat()]
    return {
        "rows_in": int(len(df)), "rows_out": int(len(df)), "dropped": [], "dropped_count": 0, "warnings": [],
        "missing_by_column": {c: int(df[c].isna().sum()) for c in df.columns},
        "outcome_distribution": dist, "date_range": dr,
    }


def orders_frame(db: Session, seller_id: str, *, labelled_only: bool = False, historical: bool | None = None,
                 extra: bool = False) -> pd.DataFrame:
    cols = [getattr(Order, c) for c in CANON_COLS]
    if extra:
        cols += [Order.id, Order.status, Order.is_historical, Order.risk_probability, Order.risk_tier,
                 Order.experiment_group, Order.recommended_action, Order.created_at, Order.outcome_at]
    q = select(*cols).where(Order.seller_id == seller_id)
    if labelled_only:
        q = q.where(Order.outcome.is_not(None))
    if historical is not None:
        q = q.where(Order.is_historical.is_(historical))
    rows = db.execute(q).all()
    names = [c.key for c in cols]
    df = pd.DataFrame(rows, columns=names)
    if len(df):
        df["order_date"] = pd.to_datetime(df["order_date"])
        df["order_value"] = df["order_value"].astype(float)
        if "risk_probability" in df:
            df["risk_probability"] = pd.to_numeric(df["risk_probability"], errors="coerce").astype(float)
    else:
        df = pd.DataFrame({c: pd.Series(dtype="object") for c in names})
        df["order_date"] = pd.to_datetime(df["order_date"])
        df["order_value"] = df["order_value"].astype(float)
        if "risk_probability" in df:
            df["risk_probability"] = df["risk_probability"].astype(float)
    return df


def nan_to_none(x: Any) -> Any:
    if isinstance(x, float) and not np.isfinite(x):
        return None
    return x
