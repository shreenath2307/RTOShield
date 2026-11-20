"""Drift + fairness reports built from the database."""
from __future__ import annotations

import threading
from datetime import timedelta

import pandas as pd
from sqlalchemy.orm import Session

from app.core.jsonsafe import json_safe
from app.db.models import Seller
from app.services.ingest import CANON_COLS, orders_frame
from app.services.model_registry import registry

_fair_cache: dict[tuple, dict] = {}
_fair_lock = threading.Lock()
FAIRNESS_SAMPLE = 3000


def drift(db: Session, seller: Seller) -> dict:
    from app.ml.drift import drift_report

    df = orders_frame(db, seller.id, extra=True)
    if len(df) < 50:
        raise ValueError("Not enough orders to compute drift (need at least 50)")
    hist = df[df["is_historical"].astype(bool)]
    live = df[~df["is_historical"].astype(bool)]
    if len(live) >= 50 and len(hist) >= 50:
        reference, current = hist, live[live["order_date"] >= live["order_date"].max() - timedelta(days=30)]
        if len(current) < 50:
            current = live
    else:
        cutoff = df["order_date"].max() - timedelta(days=30)
        reference, current = df[df["order_date"] < cutoff], df[df["order_date"] >= cutoff]
        if len(reference) < 50 or len(current) < 20:
            df = df.sort_values("order_date")
            k = int(len(df) * 0.8)
            reference, current = df.iloc[:k], df.iloc[k:]
    rep = drift_report(reference[CANON_COLS].reset_index(drop=True), current[CANON_COLS].reset_index(drop=True))
    rep = dict(rep)
    rep.setdefault("n_reference", int(len(reference)))
    rep.setdefault("n_current", int(len(current)))
    return json_safe(rep)


def fairness(db: Session, seller: Seller) -> dict:
    """Fairness audit on labelled orders scored by the active model.

    Uses live orders that already have outcomes plus (if needed) the most recent
    labelled historical orders re-scored with the active model.
    """
    from app.ml.fairness import fairness_report
    from app.services.scoring import build_context
    from app.services.sellers import seller_settings

    scorer = registry.get(db, seller.id)
    df = orders_frame(db, seller.id, labelled_only=True, extra=True)
    if len(df) < 50:
        raise ValueError("Need at least 50 orders with known outcomes for a fairness audit")
    key = (seller.id, scorer.version, len(df))
    with _fair_lock:
        if key in _fair_cache:
            return _fair_cache[key]
    scored = df[df["risk_probability"].notna() & ~df["is_historical"].astype(bool)].copy()
    scored["probability"] = scored["risk_probability"]
    scored["tier"] = scored["risk_tier"]
    need = FAIRNESS_SAMPLE - len(scored)
    parts = [scored]
    if need > 0:
        hist = df[df["is_historical"].astype(bool)].sort_values("order_date").tail(need)
        if len(hist):
            settings = seller_settings(seller)
            recs = hist[CANON_COLS].drop(columns=["outcome"]).to_dict("records")
            for r in recs:
                r["order_date"] = pd.Timestamp(r["order_date"]).to_pydatetime()
            ctx = build_context(db, seller.id, recs, settings)
            preds = scorer.score(recs, ctx)
            hist = hist.copy()
            hist["probability"] = [p["probability"] for p in preds]
            hist["tier"] = [p["tier"] for p in preds]
            parts.append(hist)
    full = pd.concat(parts, ignore_index=True)
    rep = fairness_report(full[CANON_COLS + ["probability", "tier"]].reset_index(drop=True))
    rep = json_safe(dict(rep))
    rep.setdefault("n", int(len(full)))
    rep.setdefault("model_version", scorer.version)
    with _fair_lock:
        _fair_cache.clear()
        _fair_cache[key] = rep
    return rep
