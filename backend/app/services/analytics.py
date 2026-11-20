"""Dashboard analytics (pandas over the seller's orders)."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.jsonsafe import json_safe
from app.db.models import Action
from app.services.ingest import orders_frame

MIN_SAMPLE = 20
GROUP_PRIOR_K = 20.0
MESSAGE_TYPES = ("CONFIRM_WHATSAPP", "CONFIRM_SMS", "PREPAID_NUDGE", "ADDRESS_VERIFY", "CONFIRM_CALL")
CONFIRM_TYPES = ("CONFIRM_WHATSAPP", "CONFIRM_SMS", "CONFIRM_CALL", "ADDRESS_VERIFY")


def _rate(num: float, den: float) -> float:
    return float(num) / float(den) if den else 0.0


def _r(x: Any, nd: int = 4) -> float | None:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return round(v, nd) if np.isfinite(v) else None


def pin_meta_map(pincodes) -> dict[str, dict]:
    from app.data.benchmarks import pincode_meta

    return {p: pincode_meta(str(p)) for p in pd.unique(pd.Series(list(pincodes), dtype="object").dropna())}


def add_benchmarks(df: pd.DataFrame) -> pd.DataFrame:
    """Adds row-level ``benchmark`` (payment-aware), ``prefix``, ``pseudo_count``."""
    if not len(df):
        df = df.copy()
        for c in ("benchmark", "prefix", "pseudo_count"):
            df[c] = pd.Series(dtype=float if c != "prefix" else object)
        return df
    meta = pin_meta_map(df["pincode"])
    df = df.copy()
    cod = df["pincode"].map(lambda p: meta.get(p, {}).get("benchmark_rto_cod", 0.25)).astype(float)
    pre = df["pincode"].map(lambda p: meta.get(p, {}).get("benchmark_rto_prepaid", 0.05)).astype(float)
    df["benchmark"] = np.where(df["payment_method"].eq("COD"), cod, pre)
    df["prefix"] = df["pincode"].astype(str).str[:3]
    df["pseudo_count"] = df["pincode"].map(lambda p: meta.get(p, {}).get("pseudo_count", 50)).astype(float)
    return df


def _labelled(df: pd.DataFrame) -> pd.DataFrame:
    return df[df["outcome"].isin(["DELIVERED", "RTO"])]


def summary(db: Session, seller_id: str, impact_net: float | None, model_version: str, cold_start: bool) -> dict:
    df = orders_frame(db, seller_id, extra=True)
    lab = _labelled(df)
    is_rto = lab["outcome"].eq("RTO")
    cod = lab["payment_method"].eq("COD")
    live = df[~df["is_historical"].astype(bool)] if len(df) else df
    tiers = live["risk_tier"].value_counts().to_dict() if len(live) else {}
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    flagged_today = int(((live["risk_tier"].isin(["medium", "high"])) & (live["created_at"] >= today)).sum()) if len(live) else 0

    acts = db.execute(
        select(Action.type, Action.status, func.count(Action.id)).where(Action.seller_id == seller_id)
        .group_by(Action.type, Action.status)
    ).all()
    sent = confirm_n = confirmed = nudge_n = converted = 0
    for t, s, n in acts:
        if t in MESSAGE_TYPES and s not in ("FAILED", "PENDING"):
            sent += n
        if t == "CONFIRM_CALL" and s != "PENDING":
            pass
        if t in CONFIRM_TYPES and s not in ("FAILED",):
            confirm_n += n
            if s in ("CONFIRMED", "ADDRESS_UPDATED", "CONVERTED_PREPAID"):
                confirmed += n
        if t == "PREPAID_NUDGE" and s not in ("FAILED",):
            nudge_n += n
            if s == "CONVERTED_PREPAID":
                converted += n
    return json_safe({
        "orders_analyzed": int(len(df)),
        "labelled_orders": int(len(lab)),
        "historical_rto_rate": _r(_rate(is_rto.sum(), len(lab))),
        "cod_rto_rate": _r(_rate((is_rto & cod).sum(), cod.sum())),
        "prepaid_rto_rate": _r(_rate((is_rto & ~cod).sum(), (~cod).sum())),
        "live_orders": int(len(live)),
        "tiers": {"low": int(tiers.get("low", 0)), "medium": int(tiers.get("medium", 0)), "high": int(tiers.get("high", 0))},
        "flagged_today": flagged_today,
        "interventions_sent": int(sent),
        "confirmation_rate": _r(_rate(confirmed, confirm_n)),
        "prepaid_conversion_rate": _r(_rate(converted, nudge_n)),
        "est_savings": _r(impact_net or 0.0, 2),
        "est_savings_label": "Estimated — validate with pilot",
        "model_version": model_version,
        "cold_start": cold_start,
    })


def trend(db: Session, seller_id: str, granularity: str = "week") -> list[dict]:
    df = orders_frame(db, seller_id, extra=True)
    if not len(df):
        return []
    freq = "M" if granularity == "month" else "W"
    df = df.copy()
    df["period"] = df["order_date"].dt.to_period(freq).dt.start_time
    out = []
    for period, g in df.groupby("period", sort=True):
        lab = _labelled(g)
        rto = lab["outcome"].eq("RTO")
        cod = lab["payment_method"].eq("COD")
        pr = g["risk_probability"].dropna()
        out.append({
            "period": period.strftime("%Y-%m") if freq == "M" else period.strftime("%Y-%m-%d"),
            "orders": int(len(g)),
            "labelled": int(len(lab)),
            "rto_rate": _r(_rate(rto.sum(), len(lab))) if len(lab) else None,
            "cod_share": _r(_rate(g["payment_method"].eq("COD").sum(), len(g))),
            "cod_rto_rate": _r(_rate((rto & cod).sum(), cod.sum())) if cod.sum() else None,
            "prepaid_rto_rate": _r(_rate((rto & ~cod).sum(), (~cod).sum())) if (~cod).sum() else None,
            "predicted_rto_rate": _r(pr.mean()) if len(pr) else None,
        })
    return json_safe(out)


def top_risk(db: Session, seller_id: str, by: str = "pincode", limit: int = 10) -> list[dict]:
    df = orders_frame(db, seller_id, labelled_only=True)
    if not len(df):
        return []
    df = add_benchmarks(df)
    df["is_rto"] = df["outcome"].eq("RTO").astype(int)
    overall = df["is_rto"].mean()
    col = {"pincode": "pincode", "category": "product_category", "state": "state", "city": "city"}.get(by, "pincode")
    df[col] = df[col].fillna("Unknown")
    g = df.groupby(col).agg(orders=("is_rto", "size"), rto=("is_rto", "sum"), benchmark=("benchmark", "mean"),
                            pseudo=("pseudo_count", "mean"), city_=("city", "first"), state_=("state", "first"))
    k = g["pseudo"].clip(lower=5, upper=200) if col == "pincode" else GROUP_PRIOR_K
    g["observed_rate"] = g["rto"] / g["orders"]
    g["smoothed_rate"] = (g["rto"] + k * g["benchmark"]) / (g["orders"] + k)
    g["lift"] = g["smoothed_rate"] / overall if overall else 0.0
    g["low_sample"] = g["orders"] < MIN_SAMPLE
    g = g.reset_index().sort_values(["low_sample", "smoothed_rate"], ascending=[True, False]).head(int(limit))
    rows = []
    for _, r in g.iterrows():
        key = str(r[col])
        label = key
        if col == "pincode":
            label = f"{key} · {r['city_'] or 'Unknown'}"
        elif col == "city" and r["state_"]:
            label = f"{key}, {r['state_']}"
        elif col == "product_category":
            label = key.replace("_", " ").title()
        rows.append({
            "key": key, "label": label, "orders": int(r["orders"]), "rto": int(r["rto"]),
            "observed_rate": _r(r["observed_rate"]), "smoothed_rate": _r(r["smoothed_rate"]),
            "benchmark": _r(r["benchmark"]), "lift": _r(r["lift"], 3), "low_sample": bool(r["low_sample"]),
        })
    return json_safe(rows)


def heatmap(db: Session, seller_id: str) -> list[dict]:
    from app.data.benchmarks import pincode_meta

    df = orders_frame(db, seller_id, extra=True)
    if not len(df):
        return []
    df = add_benchmarks(df)
    df["labelled"] = df["outcome"].isin(["DELIVERED", "RTO"]).astype(int)
    df["is_rto"] = df["outcome"].eq("RTO").astype(int)
    out = []
    for prefix, g in df.groupby("prefix"):
        meta = pincode_meta(str(g["pincode"].iloc[0]))
        n_lab = int(g["labelled"].sum())
        rto = int(g["is_rto"].sum())
        bench = float(g["benchmark"].mean())
        k = float(meta.get("pseudo_count") or 50)
        pr = g["risk_probability"].dropna()
        if meta.get("lat") is None or meta.get("lng") is None:
            continue
        out.append({
            "pincode_prefix": str(prefix),
            "city": meta.get("city") or (g["city"].dropna().iloc[0] if g["city"].notna().any() else ""),
            "state": meta.get("state") or "",
            "lat": _r(meta.get("lat"), 5), "lng": _r(meta.get("lng"), 5),
            "orders": int(len(g)), "labelled": n_lab, "rto": rto,
            "observed_rate": _r(_rate(rto, n_lab)),
            "smoothed_rate": _r((rto + k * bench) / (n_lab + k)),
            "benchmark": _r(bench),
            "avg_risk": _r(pr.mean()) if len(pr) else None,
            "tier": int(meta.get("tier") or 2),
            "income_band": meta.get("income_band") or "mid",
            "region": meta.get("region"),
            "low_sample": n_lab < MIN_SAMPLE,
        })
    out.sort(key=lambda r: -r["orders"])
    return json_safe(out)


def recent_window(df: pd.DataFrame, days: int = 30) -> pd.DataFrame:
    if not len(df):
        return df
    cutoff = df["order_date"].max() - timedelta(days=days)
    return df[df["order_date"] >= cutoff]
