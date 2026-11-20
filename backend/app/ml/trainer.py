"""Model training: leakage-safe features, time-based split, GBM + calibration."""
from __future__ import annotations

import logging
import time
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (average_precision_score, brier_score_loss, log_loss,
                             precision_recall_curve, roc_auc_score, roc_curve)

from app.ml.features import FEATURE_LABELS, FEATURES, build_training_features
from app.ml.utils import (DEFAULT_COSTS, Calibrator, json_safe, logit, net_savings)

log = logging.getLogger(__name__)

try:  # pragma: no cover - import guard
    import lightgbm as lgb
    HAS_LGBM = True
except Exception:  # pragma: no cover
    HAS_LGBM = False

ARTIFACT_SUFFIX = ".joblib"


# --------------------------------------------------------------------------
def _next_version(seller_dir: Path) -> str:
    n = len(list(seller_dir.glob(f"*{ARTIFACT_SUFFIX}"))) + 1
    return f"v{n}-{datetime.now():%Y%m%d-%H%M}"


def _safe_auc(y, s) -> float | None:
    try:
        if len(np.unique(y)) < 2:
            return None
        return float(roc_auc_score(y, s))
    except Exception:
        return None


def _safe_ap(y, s) -> float | None:
    try:
        if len(np.unique(y)) < 2:
            return None
        return float(average_precision_score(y, s))
    except Exception:
        return None


def _downsample(rows: list[dict], k: int = 100) -> list[dict]:
    if len(rows) <= k:
        return rows
    idx = np.unique(np.linspace(0, len(rows) - 1, k).round().astype(int))
    return [rows[i] for i in idx]


def _prec_rec(y, p, thr) -> tuple[float, float]:
    f = p >= thr
    tp = float((f & (y == 1)).sum())
    prec = tp / f.sum() if f.sum() else 0.0
    rec = tp / (y == 1).sum() if (y == 1).sum() else 0.0
    return prec, rec


class _HGBWrapper:
    """Uniform interface around sklearn HistGradientBoosting (fallback)."""

    def __init__(self, **kw):
        from sklearn.ensemble import HistGradientBoostingClassifier
        self.m = HistGradientBoostingClassifier(**kw)

    def fit(self, X, y):
        self.m.fit(X, y)
        return self

    def raw(self, X):
        return np.asarray(self.m.decision_function(X), dtype=float)


def _fit_model(Xtr, ytr, Xval, yval, config: dict):
    if HAS_LGBM and not config.get("force_sklearn"):
        params = dict(n_estimators=int(config.get("n_estimators", 1500)), learning_rate=float(config.get("learning_rate", 0.03)),
                      num_leaves=int(config.get("num_leaves", 5)), min_child_samples=40, subsample=0.8,
                      subsample_freq=1, colsample_bytree=0.8, reg_lambda=2.0, verbose=-1, n_jobs=4,
                      random_state=int(config.get("seed", 42)))
        model = lgb.LGBMClassifier(**params)
        model.fit(Xtr, ytr, eval_X=(Xval,), eval_y=(yval,), eval_metric="binary_logloss",
                  callbacks=[lgb.early_stopping(60, verbose=False)])
        return model, "lightgbm"
    model = _HGBWrapper(max_iter=300, learning_rate=0.05, max_leaf_nodes=24, min_samples_leaf=40,
                        l2_regularization=1.0, early_stopping=True, random_state=42)
    model.fit(Xtr, ytr)
    return model, "sklearn-hist-gradient-boosting"


def raw_scores(model, X: pd.DataFrame) -> np.ndarray:
    if isinstance(model, _HGBWrapper):
        return model.raw(X)
    return np.asarray(model.booster_.predict(X[FEATURES], raw_score=True), dtype=float)


# --------------------------------------------------------------------------
def train(df: pd.DataFrame, seller_id: str, artifact_dir: Path, config: dict | None = None) -> dict:
    t0 = time.time()
    config = dict(config or {})
    costs = {**DEFAULT_COSTS, **(config.get("costs") or {})}
    if df is None or len(df) == 0:
        raise ValueError("No orders supplied for training")

    tf = build_training_features(df)
    lab_mask = ~np.isnan(tf.y)
    X_all = tf.X[lab_mask].reset_index(drop=True)
    y_all = tf.y[lab_mask].astype(int)
    d_all = tf.df[lab_mask].reset_index(drop=True)
    n = len(y_all)
    if n < 200:
        raise ValueError(f"Need at least 200 labelled orders to train (got {n})")
    if len(np.unique(y_all)) < 2:
        raise ValueError("Training data has a single outcome class; need both RTO and DELIVERED")

    # time-based split: last 20% = test; last 15% of train = calibration/early-stopping slice
    n_test = max(int(round(n * float(config.get("test_frac", 0.2)))), 40)
    n_trval = n - n_test
    n_cal = max(int(round(n_trval * 0.15)), 30)
    n_fit = n_trval - n_cal
    Xfit, yfit = X_all.iloc[:n_fit], y_all[:n_fit]
    Xcal, ycal = X_all.iloc[n_fit:n_trval], y_all[n_fit:n_trval]
    Xte, yte = X_all.iloc[n_trval:], y_all[n_trval:]
    if len(np.unique(yfit)) < 2 or len(np.unique(ycal)) < 2:
        raise ValueError("Not enough outcome variety over time to train a model")

    model, algorithm = _fit_model(Xfit, yfit, Xcal, ycal, config)
    cal_method = "isotonic" if n_cal >= 2000 else "sigmoid"
    calibrator = Calibrator(cal_method).fit(raw_scores(model, Xcal), ycal)
    p = calibrator.predict(raw_scores(model, Xte))

    base_rate = float(y_all[:n_trval].mean())
    metrics = {
        "roc_auc": _safe_auc(yte, p),
        "pr_auc": _safe_ap(yte, p),
        "brier": float(brier_score_loss(yte, p)),
        "log_loss": float(log_loss(yte, np.clip(p, 1e-6, 1 - 1e-6), labels=[0, 1])),
    }

    # ---- thresholds
    medium = float(np.quantile(p, 0.65)) if len(p) else 0.18
    vals = d_all["order_value"].to_numpy(dtype=float)[n_trval:]
    grid = np.unique(np.round(np.concatenate([np.linspace(0.05, 0.9, 86), np.quantile(p, np.linspace(0.5, 0.99, 50))]), 3))
    best_thr, best_val = None, -np.inf
    for t in grid:
        frac = float((p >= t).mean())
        if t < medium + 0.03 or frac > 0.25 or frac < 0.02:
            continue
        v = net_savings(yte, p >= t, vals, costs)
        if v > best_val:
            best_thr, best_val = float(t), v
    if best_thr is None:
        best_thr = float(min(max(np.quantile(p, 0.88), medium + 0.03), 0.95))
    medium = float(min(medium, best_thr - 0.02))
    thresholds = {"medium": round(max(medium, 0.01), 3), "high": round(best_thr, 3)}

    ph, rh = _prec_rec(yte, p, thresholds["high"])
    pm, rm = _prec_rec(yte, p, thresholds["medium"])
    metrics.update(precision_high=ph, recall_high=rh, precision_medium=pm, recall_medium=rm)

    # ---- baselines
    cod = Xte["is_cod"].to_numpy()
    bench = Xte["pin_benchmark"].to_numpy()
    baselines = {
        "cod_only": {"roc_auc": _safe_auc(yte, cod), "pr_auc": _safe_ap(yte, cod)},
        "pincode_benchmark": {"roc_auc": _safe_auc(yte, bench), "pr_auc": _safe_ap(yte, bench)},
    }

    # ---- calibration bins (quantile bins on prediction)
    calib = []
    try:
        bins = pd.qcut(pd.Series(p), q=min(10, max(2, len(p) // 30)), duplicates="drop")
        g = pd.DataFrame({"p": p, "y": yte, "b": bins}).groupby("b", observed=True)
        for i, (_, grp) in enumerate(g):
            calib.append({"bin": i, "predicted": float(grp.p.mean()), "observed": float(grp.y.mean()), "count": int(len(grp))})
    except Exception:  # pragma: no cover
        pass

    # ---- curves
    pr_rows, roc_rows = [], []
    if len(np.unique(yte)) > 1:
        prec, rec, thr = precision_recall_curve(yte, p)
        pr_rows = [{"precision": float(a), "recall": float(b), "threshold": float(c)} for a, b, c in zip(prec[:-1], rec[:-1], thr)]
        fpr, tpr, _ = roc_curve(yte, p)
        roc_rows = [{"fpr": float(a), "tpr": float(b)} for a, b in zip(fpr, tpr)]

    # ---- feature importance (gain)
    if algorithm == "lightgbm":
        imp = model.booster_.feature_importance(importance_type="gain").astype(float)
    else:
        imp = _permutation_importance(model, calibrator, Xte, yte)
    imp = imp / imp.sum() if imp.sum() > 0 else imp
    fi = sorted(({"feature": f, "label": FEATURE_LABELS.get(f, f), "importance": float(v)} for f, v in zip(FEATURES, imp)),
                key=lambda r: -r["importance"])

    # ---- cost curve
    total_rto = max(int(yte.sum()), 1)
    cost_curve = []
    for t in np.round(np.arange(0.05, 0.951, 0.05), 2):
        f = p >= t
        cost_curve.append({"threshold": float(t), "flagged_pct": float(f.mean()),
                           "rto_caught_pct": float((f & (yte == 1)).sum() / total_rto),
                           "est_net_savings": round(net_savings(yte, f, vals, costs), 2)})

    fh = p >= thresholds["high"]
    confusion = {"tp": int((fh & (yte == 1)).sum()), "fp": int((fh & (yte == 0)).sum()),
                 "tn": int((~fh & (yte == 0)).sum()), "fn": int((~fh & (yte == 1)).sum())}

    # ---- persist
    seller_dir = Path(artifact_dir) / str(seller_id)
    seller_dir.mkdir(parents=True, exist_ok=True)
    version = _next_version(seller_dir)
    path = seller_dir / f"{version}{ARTIFACT_SUFFIX}"
    i = 1
    while path.exists():  # same-minute retrain
        i += 1
        version = f"{version.split('-')[0]}-{datetime.now():%Y%m%d-%H%M}-{i}"
        path = seller_dir / f"{version}{ARTIFACT_SUFFIX}"

    reference = {
        "median": X_all.iloc[:n_trval].median().to_dict(),
        "base_logit": float(logit(base_rate)),
    }
    report = {
        "version": version,
        "trained_at": datetime.now().isoformat(timespec="seconds"),
        "algorithm": f"{algorithm} + {cal_method} calibration",
        "n_train": int(n_trval),
        "n_test": int(n_test),
        "split": "time-based",
        "base_rate": base_rate,
        "metrics": metrics,
        "baselines": baselines,
        "calibration": calib,
        "pr_curve": _downsample(pr_rows),
        "roc_curve": _downsample(roc_rows),
        "feature_importance": fi,
        "thresholds": thresholds,
        "cost_curve": cost_curve,
        "confusion_high": confusion,
        "artifact_path": str(path),
        "train_seconds": round(time.time() - t0, 2),
        "test_period": [d_all["order_date"].iloc[n_trval].isoformat(), d_all["order_date"].iloc[-1].isoformat()],
    }
    report = json_safe(report)

    artifact = {
        "kind": "rto-shield-model",
        "version": version,
        "seller_id": str(seller_id),
        "algorithm": algorithm,
        "model": model,
        "calibrator": calibrator,
        "features": list(FEATURES),
        "snapshots": tf.snapshots,
        "reference": reference,
        "thresholds": thresholds,
        "n_labelled": int(n),
        "report": report,
    }
    joblib.dump(artifact, path, compress=3)
    report["train_seconds"] = round(time.time() - t0, 2)
    log.info("Trained %s in %.1fs (AUC=%s)", version, report["train_seconds"], metrics["roc_auc"])
    return report


def _permutation_importance(model, calibrator, X, y) -> np.ndarray:
    rng = np.random.default_rng(0)
    base = _safe_auc(y, calibrator.predict(raw_scores(model, X))) or 0.5
    out = []
    for f in FEATURES:
        Xp = X.copy()
        Xp[f] = rng.permutation(Xp[f].to_numpy())
        auc = _safe_auc(y, calibrator.predict(raw_scores(model, Xp))) or 0.5
        out.append(max(base - auc, 0.0))
    return np.asarray(out, dtype=float)
