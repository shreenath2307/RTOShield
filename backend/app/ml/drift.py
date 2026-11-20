"""Data / concept drift monitoring via Population Stability Index."""
from __future__ import annotations

from datetime import datetime

import numpy as np
import pandas as pd

from app.ml.features import FEATURE_LABELS, build_training_features
from app.ml.seasonality import season_flags
from app.ml.utils import json_safe

PSI_MODERATE = 0.1
PSI_DRIFT = 0.2
# raw canonical categoricals monitored in addition to engineered features
CATEGORICAL = ["payment_method", "product_category", "channel"]
# history-accumulating encodings (category_rate, cust_prior_orders) drift by construction; excluded
NUMERIC = ["is_cod", "log_value", "pin_benchmark", "pin_tier", "hour", "is_late_night", "addr_quality",
           "quantity", "is_new_customer", "phone_valid", "channel_risk"]


def _psi_from_props(p_ref: np.ndarray, p_cur: np.ndarray) -> float:
    eps = 1e-4
    p_ref = np.clip(p_ref, eps, None)
    p_cur = np.clip(p_cur, eps, None)
    p_ref, p_cur = p_ref / p_ref.sum(), p_cur / p_cur.sum()
    return float(np.sum((p_cur - p_ref) * np.log(p_cur / p_ref)))


def psi_numeric(ref: pd.Series, cur: pd.Series, bins: int = 10) -> float:
    ref = pd.to_numeric(ref, errors="coerce").dropna().to_numpy()
    cur = pd.to_numeric(cur, errors="coerce").dropna().to_numpy()
    if len(ref) == 0 or len(cur) == 0:
        return 0.0
    edges = np.unique(np.quantile(ref, np.linspace(0, 1, bins + 1)))
    if len(edges) <= 2:  # (near) constant / binary feature -> treat as categorical
        return psi_categorical(pd.Series(ref), pd.Series(cur))
    edges[0], edges[-1] = -np.inf, np.inf
    r = np.histogram(ref, edges)[0].astype(float)
    c = np.histogram(cur, edges)[0].astype(float)
    return _psi_from_props(r / r.sum(), c / c.sum())


def psi_categorical(ref: pd.Series, cur: pd.Series) -> float:
    ref = ref.astype(str).fillna("na")
    cur = cur.astype(str).fillna("na")
    if len(ref) == 0 or len(cur) == 0:
        return 0.0
    cats = sorted(set(ref.unique()) | set(cur.unique()))
    r = ref.value_counts(normalize=True).reindex(cats, fill_value=0).to_numpy(dtype=float)
    c = cur.value_counts(normalize=True).reindex(cats, fill_value=0).to_numpy(dtype=float)
    return _psi_from_props(r, c)


def _status(psi: float) -> str:
    return "drift" if psi >= PSI_DRIFT else "moderate" if psi >= PSI_MODERATE else "stable"


def _rto_rate(df: pd.DataFrame) -> float | None:
    if "outcome" not in df.columns:
        return None
    oc = df["outcome"].astype(object).map(lambda o: str(o).upper() if o is not None and o == o else None)
    lab = oc[oc.isin(["RTO", "DELIVERED"])]
    return float((lab == "RTO").mean()) if len(lab) else None


def drift_report(reference: pd.DataFrame, current: pd.DataFrame, psi_threshold: float = PSI_DRIFT) -> dict:
    season = season_flags(datetime.now())
    empty = {"overall_psi": 0.0, "features": [], "rto_rate_reference": None, "rto_rate_current": None,
             "retrain_recommended": False, "reasons": [], "season": season}
    if reference is None or current is None or len(reference) < 20 or len(current) < 20:
        empty["reasons"] = ["Not enough orders to assess drift yet (need ≥20 in each window)."]
        return json_safe(empty)

    # Engineered features: computed as-of each order within each window. The
    # current window is appended to the reference so history is respected.
    feats = []
    try:
        ref_tf = build_training_features(reference)
        combo = pd.concat([reference, current.assign(_cur=1)], ignore_index=True)
        combo["_cur"] = combo["_cur"].fillna(0) if "_cur" in combo else 0
        all_tf = build_training_features(combo)
        cur_X = all_tf.X[all_tf.df["_cur"].to_numpy() == 1]
        for f in NUMERIC:
            psi = psi_numeric(ref_tf.X[f], cur_X[f])
            feats.append({"feature": f, "label": FEATURE_LABELS.get(f, f), "psi": round(psi, 4), "status": _status(psi)})
    except Exception:
        pass
    for f in CATEGORICAL:
        if f in reference.columns and f in current.columns:
            psi = psi_categorical(reference[f], current[f])
            feats.append({"feature": f, "label": f.replace("_", " ").title(), "psi": round(psi, 4), "status": _status(psi)})

    feats.sort(key=lambda r: -r["psi"])
    overall = float(np.mean([r["psi"] for r in feats])) if feats else 0.0
    r_ref, r_cur = _rto_rate(reference), _rto_rate(current)

    reasons = []
    drifted = [r for r in feats if r["psi"] >= psi_threshold]
    for r in drifted[:5]:
        reasons.append(f"{r['label']} distribution shifted (PSI {r['psi']:.2f}).")
    if overall >= psi_threshold:
        reasons.append(f"Overall PSI {overall:.2f} exceeds threshold {psi_threshold:.2f}.")
    rate_shift = False
    if r_ref is not None and r_cur is not None:
        n_cur = int(current["outcome"].notna().sum()) if "outcome" in current.columns else 0
        if n_cur >= 50 and abs(r_cur - r_ref) >= max(0.03, 0.2 * r_ref):
            rate_shift = True
            reasons.append(f"RTO rate moved from {r_ref:.1%} to {r_cur:.1%} (concept drift).")
    if season["is_festival_window"] or season["is_sale_period"]:
        reasons.append(f"Seasonal period active ({season['festival_name'] or 'sale'}): expect temporary shifts.")
    retrain = bool(len(drifted) >= 2 or overall >= psi_threshold or rate_shift)
    if not reasons:
        reasons.append("No material drift detected.")

    return json_safe({"overall_psi": round(overall, 4), "features": feats, "rto_rate_reference": r_ref,
                      "rto_rate_current": r_cur, "retrain_recommended": retrain, "reasons": reasons, "season": season})
