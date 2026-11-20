"""Shared ML helpers: JSON safety, logit math, calibrators, cost model."""
from __future__ import annotations

import math
from datetime import date, datetime
from typing import Any

import numpy as np

EPS = 1e-6

# Default costs (CONTRACT Settings.costs)
DEFAULT_COSTS = {
    "forward_shipping": 70.0, "return_shipping": 70.0, "packaging": 25.0,
    "turnover_cost_pct": 0.04, "margin_pct": 0.35, "whatsapp_msg": 0.8, "sms": 0.25, "call": 6.0,
}
# Intervention assumed for the "high" tier when estimating savings: a call/manual
# review (effectiveness 0.45) with some friction on genuine buyers.
HIGH_ACTION_EFFECT = 0.45
HIGH_ACTION_FRICTION = 0.08
DEFAULT_THRESHOLDS = {"medium": 0.18, "high": 0.35}


def logit(p):
    p = np.clip(np.asarray(p, dtype=float), EPS, 1 - EPS)
    return np.log(p / (1 - p))


def sigmoid(z):
    return 1.0 / (1.0 + np.exp(-np.asarray(z, dtype=float)))


def json_safe(obj: Any) -> Any:
    """Recursively convert numpy/pandas types to JSON-safe python; NaN/inf -> None."""
    if obj is None or isinstance(obj, (bool, str)):
        return obj
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, (int, np.integer)):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        f = float(obj)
        return None if (math.isnan(f) or math.isinf(f)) else f
    if isinstance(obj, dict):
        return {str(k): json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [json_safe(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return [json_safe(v) for v in obj.tolist()]
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    try:
        import pandas as pd
        if isinstance(obj, pd.Timestamp):
            return None if pd.isna(obj) else obj.isoformat()
    except Exception:  # pragma: no cover
        pass
    return str(obj)


def rto_loss(order_value, costs: dict | None = None):
    c = {**DEFAULT_COSTS, **(costs or {})}
    return c["forward_shipping"] + c["return_shipping"] + c["packaging"] + c["turnover_cost_pct"] * np.asarray(order_value, dtype=float)


def net_savings(y, flagged, order_value, costs: dict | None = None,
                effect: float = HIGH_ACTION_EFFECT, friction: float = HIGH_ACTION_FRICTION) -> float:
    """Realised net savings (INR) of intervening on flagged orders, on labelled data."""
    c = {**DEFAULT_COSTS, **(costs or {})}
    y = np.asarray(y, dtype=float)
    f = np.asarray(flagged, dtype=bool)
    v = np.asarray(order_value, dtype=float)
    loss = rto_loss(v, c)
    gain = (y[f] * effect * loss[f]).sum()
    cost = f.sum() * c["call"]
    fric = ((1 - y[f]) * friction * c["margin_pct"] * v[f]).sum()
    return float(gain - cost - fric)


def fit_logistic(X: np.ndarray, y: np.ndarray, l2: float = 1e-2, iters: int = 50) -> tuple[np.ndarray, float]:
    """Dependency-free L2 logistic regression (Newton-Raphson). Returns (weights, bias)."""
    X = np.asarray(X, dtype=float)
    y = np.asarray(y, dtype=float)
    n, k = X.shape
    Xb = np.hstack([X, np.ones((n, 1))])
    w = np.zeros(k + 1)
    reg = np.full(k + 1, l2 * n)
    reg[-1] = 0.0
    for _ in range(iters):
        p = sigmoid(Xb @ w)
        g = Xb.T @ (p - y) + reg * w
        h = (Xb * (p * (1 - p))[:, None]).T @ Xb + np.diag(reg) + 1e-9 * np.eye(k + 1)
        step = np.linalg.solve(h, g)
        w -= step
        if np.abs(step).max() < 1e-7:
            break
    return w[:-1], float(w[-1])


class Calibrator:
    """Maps raw model scores (logit space) to calibrated probabilities."""

    def __init__(self, method: str = "sigmoid"):
        self.method = method
        self.model = None

    def fit(self, raw: np.ndarray, y: np.ndarray) -> "Calibrator":
        raw = np.asarray(raw, dtype=float)
        y = np.asarray(y, dtype=int)
        if self.method == "isotonic":
            from sklearn.isotonic import IsotonicRegression
            self.model = IsotonicRegression(y_min=0.001, y_max=0.999, out_of_bounds="clip").fit(raw, y)
        else:
            self.model = fit_logistic(raw.reshape(-1, 1), y, l2=1e-3)
        return self

    def predict(self, raw: np.ndarray) -> np.ndarray:
        raw = np.asarray(raw, dtype=float)
        if self.model is None:
            return sigmoid(raw)
        if self.method == "isotonic":
            p = self.model.predict(raw)
        else:
            w, b = self.model
            p = sigmoid(raw * w[0] + b)
        return np.clip(p, 0.001, 0.999)
