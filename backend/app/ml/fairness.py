"""Fairness audit for RTO risk scores.

Income band is joined from the pincode benchmark table for AUDIT ONLY; it is
never a model feature. We check disparate impact of flagging (80% rule),
equal-opportunity (TPR) gaps, per-group calibration, and how much the model
relies on pincode by comparing against a pincode-blind model.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.ml.features import PINCODE_FEATURES, build_training_features, pincode_meta_safe, _clean_pin
from app.ml.utils import fit_logistic, json_safe, sigmoid

MIN_GROUP_N = 30
# output key -> (column, human name)
DIMENSIONS = {"income_band": ("income_band", "income band"), "tier": ("pincode_tier", "pincode tier"),
              "region": ("region", "region")}


def _auc(y, s):
    from sklearn.metrics import roc_auc_score
    y = np.asarray(y)
    if len(y) < 10 or len(np.unique(y)) < 2:
        return None
    return float(roc_auc_score(y, s))


def _group_rows(d: pd.DataFrame, dim: str) -> list[dict]:
    rows = []
    for g, grp in d.groupby(dim, dropna=False):
        lab = grp[grp["y"].notna()]
        y = lab["y"].to_numpy(dtype=float)
        f = lab["flag"].to_numpy(dtype=bool)
        pos, neg = y == 1, y == 0
        tpr = float(f[pos].mean()) if pos.sum() else None
        fpr = float(f[neg].mean()) if neg.sum() else None
        obs = float(y.mean()) if len(y) else None
        cal_gap = float(lab["probability"].mean() - obs) if len(y) else None
        rows.append({"group": str(g), "n": int(len(grp)), "flag_rate": float(grp["flag"].mean()),
                     "mean_score": float(grp["probability"].mean()), "observed_rto_rate": obs,
                     "tpr": tpr, "fpr": fpr, "calibration_gap": cal_gap})
    return sorted(rows, key=lambda r: r["group"])


def _logreg_predict(Xtr: np.ndarray, ytr: np.ndarray, Xte: np.ndarray) -> np.ndarray:
    mu, sd = Xtr.mean(axis=0), Xtr.std(axis=0)
    sd[sd < 1e-9] = 1.0
    w, b = fit_logistic((Xtr - mu) / sd, ytr, l2=1e-3)
    return sigmoid(((Xte - mu) / sd) @ w + b)


def _pincode_blind(df: pd.DataFrame, d: pd.DataFrame) -> dict:
    """Compare a full vs pincode-blind logistic model on time-split labelled data."""
    out = {"roc_auc_full": None, "roc_auc_blind": None, "flag_overlap": None}
    try:
        tf = build_training_features(df.drop(columns=["probability", "tier"], errors="ignore"))
        mask = ~np.isnan(tf.y)
        X, y = tf.X[mask].reset_index(drop=True), tf.y[mask].astype(int)
        if len(y) < 200 or len(np.unique(y)) < 2:
            return out
        cut = int(len(y) * 0.7)
        if len(np.unique(y[:cut])) < 2 or len(np.unique(y[cut:])) < 2:
            return out
        blind_cols = [c for c in X.columns if c not in PINCODE_FEATURES]
        pf = _logreg_predict(X.iloc[:cut].to_numpy(), y[:cut], X.iloc[cut:].to_numpy())
        pb = _logreg_predict(X[blind_cols].iloc[:cut].to_numpy(), y[:cut], X[blind_cols].iloc[cut:].to_numpy())
        out["roc_auc_full"] = _auc(y[cut:], pf)
        out["roc_auc_blind"] = _auc(y[cut:], pb)
        rate = float(d["flag"].mean()) if len(d) else 0.3
        rate = min(max(rate, 0.05), 0.6)
        ff = pf >= np.quantile(pf, 1 - rate)
        fb = pb >= np.quantile(pb, 1 - rate)
        union = (ff | fb).sum()
        out["flag_overlap"] = float((ff & fb).sum() / union) if union else 1.0
    except Exception:  # pragma: no cover - audit must never crash
        pass
    return out


def fairness_report(df: pd.DataFrame, flag_tiers: tuple[str, ...] = ("medium", "high")) -> dict:
    if df is None or len(df) == 0 or "probability" not in df.columns:
        return json_safe({"status": "warn", "groups": {}, "disparate_impact": {}, "equal_opportunity_gap": {},
                          "pincode_blind": {"roc_auc_full": None, "roc_auc_blind": None, "flag_overlap": None},
                          "findings": ["No scored orders available for a fairness audit yet."],
                          "recommendations": ["Score some orders (or load demo data) and re-run the audit."]})
    d = df.copy()
    d["probability"] = pd.to_numeric(d["probability"], errors="coerce").fillna(0.0)
    tier_col = d["tier"] if "tier" in d.columns else pd.Series("low", index=d.index)
    d["flag"] = tier_col.astype(str).str.lower().isin(flag_tiers)
    if "outcome" in d.columns:
        oc = d["outcome"].astype(object).map(lambda o: str(o).upper() if o is not None and o == o else None)
        d["y"] = oc.map({"RTO": 1.0, "DELIVERED": 0.0})
    else:
        d["y"] = np.nan
    metas = d["pincode"].map(lambda p: pincode_meta_safe(_clean_pin(p)))
    d["income_band"] = metas.map(lambda m: m.get("income_band") or "unknown")
    d["pincode_tier"] = metas.map(lambda m: f"tier {m.get('tier') or '?'}")
    d["region"] = metas.map(lambda m: m.get("region") or "unknown")

    groups, di, eo = {}, {}, {}
    findings, recs = [], []
    worst_di, worst_eo = 1.0, 0.0
    worst_unjustified_di = 1.0
    for dim, (column, name) in DIMENSIONS.items():
        rows = _group_rows(d, column)
        groups[dim] = rows
        big = [r for r in rows if r["n"] >= MIN_GROUP_N]
        rates = [r["flag_rate"] for r in big]
        if len(rates) >= 2 and max(rates) > 0:
            ratio = min(rates) / max(rates)
            di[dim] = ratio
            worst_di = min(worst_di, ratio)
            lo = min(big, key=lambda r: r["flag_rate"])
            hi = max(big, key=lambda r: r["flag_rate"])
            obs = [r["observed_rto_rate"] for r in big if r["observed_rto_rate"] is not None]
            obs_ratio = (min(obs) / max(obs)) if len(obs) >= 2 and max(obs) > 0 else None
            # Disparity is "risk-justified" when flag-rate disparity is no more than
            # ~2x the disparity in observed outcomes (ratio terms).
            if obs_ratio is None or ratio < 0.5 * obs_ratio:
                worst_unjustified_di = min(worst_unjustified_di, ratio)
            if ratio < 0.8:
                obs_ok = (hi["observed_rto_rate"] or 0) > (lo["observed_rto_rate"] or 0) * 1.2
                if obs_ratio is not None and ratio < 0.5 * obs_ratio:
                    findings.append(f"Flag-rate disparity by {name} (ratio {ratio:.2f}) is larger than the observed RTO "
                                    f"disparity (ratio {obs_ratio:.2f}) — the model amplifies group differences.")
                findings.append(
                    f"Flag rate by {name}: '{hi['group']}' {hi['flag_rate']:.0%} vs '{lo['group']}' {lo['flag_rate']:.0%} "
                    f"(ratio {ratio:.2f}, below the 80% rule)"
                    + (f"; observed RTO also differs ({hi['observed_rto_rate']:.0%} vs {lo['observed_rto_rate']:.0%})."
                       if obs_ok and hi["observed_rto_rate"] is not None and lo["observed_rto_rate"] is not None else ".")
                )
        else:
            di[dim] = None
        tprs = [r["tpr"] for r in big if r["tpr"] is not None]
        if len(tprs) >= 2:
            gap = max(tprs) - min(tprs)
            eo[dim] = gap
            worst_eo = max(worst_eo, gap)
            if gap > 0.15:
                findings.append(f"Equal-opportunity gap by {name} is {gap:.0%}: RTO-bound orders are caught unevenly across groups.")
        else:
            eo[dim] = None
        for r in big:
            if r["calibration_gap"] is not None and abs(r["calibration_gap"]) > 0.08:
                direction = "over" if r["calibration_gap"] > 0 else "under"
                findings.append(f"Scores {direction}-estimate risk for {name} '{r['group']}' by {abs(r['calibration_gap']):.0%}.")

    blind = _pincode_blind(df, d)
    if blind["roc_auc_full"] is not None and blind["roc_auc_blind"] is not None:
        drop = blind["roc_auc_full"] - blind["roc_auc_blind"]
        findings.append(f"Pincode-blind model AUC {blind['roc_auc_blind']:.3f} vs full {blind['roc_auc_full']:.3f} "
                        f"(Δ {drop:+.3f}); flag overlap {blind['flag_overlap']:.0%}.")
        if drop < 0.02:
            recs.append("Pincode adds little predictive power — consider capping or removing pincode features entirely.")

    if worst_unjustified_di < 0.6 or worst_eo > 0.35:
        status = "fail"
    elif worst_di < 0.8 or worst_eo > 0.15:
        status = "warn"
    else:
        status = "pass"

    if status == "pass":
        findings.insert(0, "Flag rates and true-positive rates are within tolerance across income band, pincode tier and region.")
        recs.append("Keep the pincode fairness cap enabled and re-run this audit after each retrain.")
    else:
        recs.append("Keep the pincode fairness cap on so no order is marked high-risk solely because of where the customer lives.")
        recs.append("Prefer soft interventions (WhatsApp confirmation, prepaid nudge) over cancellation for flagged orders in affected groups.")
        if worst_eo > 0.15:
            recs.append("Consider group-aware threshold review so RTO-bound orders are caught at similar rates across groups.")
        recs.append("Validate with a holdout: compare RTO outcomes for flagged vs. control orders per group.")
    recs.append("Income band is used only for this audit and is never a model input.")

    return json_safe({"status": status, "groups": groups, "disparate_impact": di, "equal_opportunity_gap": eo,
                      "pincode_blind": blind, "findings": findings, "recommendations": recs})
