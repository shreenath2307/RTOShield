"""Real-time RTO risk scoring with local explanations and a fairness guard."""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from app.ml.features import (FEATURE_GROUPS, FEATURES, NATIONAL_COD, NATIONAL_PREPAID,
                             build_scoring_features, describe_group, mixed_benchmark, orders_to_frame)
from app.ml.utils import DEFAULT_THRESHOLDS, json_safe, logit, sigmoid

PRIOR_BLEND_K = 500.0
COLD_START_VERSION = "cold-start-benchmark-v1"
DEFAULT_COD_SHARE = 0.65
# Benchmarks describe area averages; this shift re-centres the additive
# adjustments so an average order lands near the benchmark rate.
COLD_START_OFFSET = -0.25


@dataclass
class ScoringContext:
    customer_history: dict = field(default_factory=dict)  # customer_id -> {orders, rto, delivered, last_order_at}
    pincode_stats: dict = field(default_factory=dict)     # pincode -> {orders, rto}
    thresholds: dict = field(default_factory=lambda: dict(DEFAULT_THRESHOLDS))
    n_seller_labelled: int = 0
    pincode_cap: float = 0.35


# --------------------------------------------------------------------------
# Transparent benchmark model (cold start / prior)
# --------------------------------------------------------------------------
_CATEGORY_PRIORS = [
    (r"fashion|apparel|cloth|wear|saree|kurta|dress|footwear|shoe|sandal|jewel|accessor", 0.15),
    (r"electronic|mobile|gadget|phone|audio|watch", 0.05),
    (r"grocery|food|beauty|cosmetic|skin|health|personal|pharma|baby", -0.20),
    (r"home|kitchen|decor|furniture", 0.0),
]
_VALUE_BAND_LOGIT = {0: -0.2, 1: -0.05, 2: 0.15, 3: 0.35}
_CHANNEL_LOGIT = {0: -0.05, 1: 0.0, 2: 0.1, 3: 0.2}


def _prior_contribs(F: pd.DataFrame, frame: pd.DataFrame, snapshots: dict | None) -> tuple[np.ndarray, np.ndarray]:
    """Logit-space contributions of the benchmark model.

    Returns (intercept[n], contrib[n, n_features]) where contributions are
    attributed to the first feature of each group (groups are what we explain).
    """
    snap = snapshots or {}
    cod_share = float(snap.get("cod_share", DEFAULT_COD_SHARE))
    nat_mix = cod_share * NATIONAL_COD + (1 - cod_share) * NATIONAL_PREPAID
    global_rate = snap.get("global_rate")
    n = len(F)
    C = np.zeros((n, len(FEATURES)))
    col = {f: i for i, f in enumerate(FEATURES)}
    intercept = np.full(n, float(logit(nat_mix)) + COLD_START_OFFSET)
    for i in range(n):
        r = F.iloc[i]
        is_cod = r["is_cod"] > 0.5
        nat_pay = NATIONAL_COD if is_cod else NATIONAL_PREPAID
        C[i, col["is_cod"]] = float(logit(nat_pay) - logit(nat_mix))
        # pincode: benchmark lift + seller-observed lift (EB-smoothed)
        pin = frame.iloc[i]["pincode"]
        mix_b = mixed_benchmark(pin, cod_share)
        C[i, col["pin_smoothed_rate"]] = float(logit(r["pin_benchmark"]) - logit(nat_pay)
                                               + (logit(r["pin_smoothed_rate"]) - logit(mix_b)))
        vb = int(r["value_band"])
        C[i, col["log_value"]] = _VALUE_BAND_LOGIT.get(vb, 0.0) * (1.0 if is_cod else 0.5)
        if r["is_new_customer"] > 0.5:
            cc = 0.20
        else:
            cust_rate = 1 - r["cust_trust"]
            cc = 0.8 * float(logit(cust_rate) - logit(0.2)) - 0.25
        C[i, col["cust_prior_orders"]] = cc
        C[i, col["hour"]] = 0.35 if r["is_late_night"] > 0.5 else -0.05
        C[i, col["addr_quality"]] = 1.2 * (0.65 - r["addr_quality"])
        C[i, col["phone_valid"]] = 0.0 if r["phone_valid"] > 0.5 else 0.4
        if snap.get("category") and frame.iloc[i]["product_category"] in snap["category"] and global_rate:
            catc = float(logit(r["category_rate"]) - logit(global_rate))
        else:
            cat = str(frame.iloc[i]["product_category"])
            catc = next((v for pat, v in _CATEGORY_PRIORS if re.search(pat, cat)), 0.0)
        C[i, col["category_rate"]] = catc
        C[i, col["quantity"]] = 0.1 if r["quantity"] > 3 else 0.0
        C[i, col["channel_risk"]] = _CHANNEL_LOGIT.get(int(r["channel_risk"]), 0.0)
        C[i, col["is_festival"]] = 0.15 * r["is_festival"] + 0.1 * r["is_monsoon"] + 0.1 * r["is_sale"]
    return intercept, C


def _group_sum(C: np.ndarray) -> dict[str, np.ndarray]:
    col = {f: i for i, f in enumerate(FEATURES)}
    return {g: C[:, [col[f] for f in fs]].sum(axis=1) for g, fs in FEATURE_GROUPS.items()}


# --------------------------------------------------------------------------
class RiskScorer:
    def __init__(self, artifact: dict | None = None):
        self.artifact = artifact
        self.is_cold_start = artifact is None
        self.version = COLD_START_VERSION if artifact is None else str(artifact["version"])
        self.snapshots = (artifact or {}).get("snapshots", {}) if artifact else {}
        self.report = (artifact or {}).get("report") if artifact else None
        self.thresholds = (artifact or {}).get("thresholds") if artifact else None
        self.algorithm = (artifact or {}).get("algorithm", "benchmark-logistic") if artifact else "benchmark-logistic"

    @classmethod
    def load(cls, artifact_path: str | Path) -> "RiskScorer":
        art = joblib.load(Path(artifact_path))
        if not isinstance(art, dict) or "model" not in art:
            raise ValueError(f"Not an RTO Shield artifact: {artifact_path}")
        return cls(art)

    @classmethod
    def cold_start(cls) -> "RiskScorer":
        return cls(None)

    # ------------------------------------------------------------------
    def _model_logit_contribs(self, F: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Return (calibrated prob, base logit[n], contribs[n, n_feat]) in calibrated logit space."""
        art = self.artifact
        model, calib = art["model"], art["calibrator"]
        X = F[FEATURES]
        if art["algorithm"] == "lightgbm":
            raw_c = np.asarray(model.booster_.predict(X, pred_contrib=True), dtype=float)
            contrib, bias = raw_c[:, :-1], raw_c[:, -1]
            raw = contrib.sum(axis=1) + bias
            p = calib.predict(raw)
            # Map raw-space attributions into calibrated logit space by rescaling.
            base_l = np.asarray(calib.predict(bias), dtype=float)
            target = logit(p) - logit(base_l)
            tot = contrib.sum(axis=1)
            scale = np.where(np.abs(tot) > 1e-6, target / np.where(np.abs(tot) > 1e-6, tot, 1.0), 1.0)
            scale = np.where((scale > 0) & (scale < 5), scale, 1.0)
            return p, logit(base_l), contrib * scale[:, None]
        # sklearn fallback: occlusion of each group against training medians
        from app.ml.trainer import raw_scores
        p = calib.predict(raw_scores(model, X))
        lp = logit(p)
        ref = art["reference"]["median"]
        contrib = np.zeros((len(X), len(FEATURES)))
        col = {f: i for i, f in enumerate(FEATURES)}
        for g, fs in FEATURE_GROUPS.items():
            Xo = X.copy()
            for f in fs:
                Xo[f] = ref.get(f, 0.0)
            lo = logit(calib.predict(raw_scores(model, Xo)))
            contrib[:, col[fs[0]]] = lp - lo
        return p, np.full(len(X), art["reference"]["base_logit"]), contrib

    def _score_frame(self, frame: pd.DataFrame, context: ScoringContext) -> list[dict]:
        F = build_scoring_features(frame, context.pincode_stats, context.customer_history, self.snapshots)
        icpt, prior_C = _prior_contribs(F, frame, self.snapshots)
        prior_logit = icpt + prior_C.sum(axis=1)
        prior_p = sigmoid(prior_logit)

        if self.is_cold_start:
            p, contrib, w = prior_p, prior_C, 0.0
        else:
            mp, _base, mC = self._model_logit_contribs(F)
            n_lab = context.n_seller_labelled or int(self.artifact.get("n_labelled", 0))
            w = n_lab / (n_lab + PRIOR_BLEND_K)
            p = w * mp + (1 - w) * prior_p
            contrib = w * mC + (1 - w) * prior_C

        thr = {**DEFAULT_THRESHOLDS, **(context.thresholds or {})}
        groups = _group_sum(contrib)
        results = []
        for i in range(len(F)):
            feats = F.iloc[i].to_dict()
            raw = frame.iloc[i].to_dict()
            prob = float(np.clip(p[i], 0.001, 0.999))
            tier = "high" if prob >= thr["high"] else "medium" if prob >= thr["medium"] else "low"

            gvals = {g: float(v[i]) for g, v in groups.items()}
            pos_total = sum(max(v, 0.0) for v in gvals.values())
            pin_c = gvals.get("pincode", 0.0)
            pincode_share = max(pin_c, 0.0) / pos_total if pos_total > 1e-9 else 0.0

            fairness_adjusted = False
            if tier == "high" and pincode_share > context.pincode_cap and pin_c > 0:
                prob_wo_pin = float(sigmoid(logit(prob) - pin_c))
                if prob_wo_pin < thr["high"]:
                    tier = "medium"
                    fairness_adjusted = True

            reasons = []
            for g, v in sorted(gvals.items(), key=lambda kv: -abs(kv[1])):
                if abs(v) < 0.02:
                    continue
                label, val = describe_group(g, feats, raw)
                reasons.append({"feature": g, "label": label, "value": val, "impact": round(float(v), 4),
                                "direction": "up" if v > 0 else "down"})
                if len(reasons) >= 6:
                    break

            pin_support = math.expm1(feats.get("pin_support", 0.0))
            cust_known = feats.get("cust_prior_orders", 0) > 0
            if self.is_cold_start:
                confidence = "medium" if (pin_support >= 30 and cust_known) else "low"
            else:
                pts = (2 if w >= 0.8 else 1 if w >= 0.4 else 0) + (1 if pin_support >= 20 else 0) + (1 if cust_known else 0)
                confidence = "high" if pts >= 3 else "medium" if pts >= 2 else "low"

            results.append(json_safe({
                "probability": round(prob, 4),
                "tier": tier,
                "confidence": confidence,
                "cold_start": self.is_cold_start,
                "model_version": self.version,
                "reasons": reasons,
                "pincode_share": round(float(pincode_share), 4),
                "fairness_adjusted": fairness_adjusted,
            }))
        return results

    def score(self, orders: list[dict], context: ScoringContext | None = None) -> list[dict]:
        if not orders:
            return []
        context = context or ScoringContext()
        frame = orders_to_frame(orders)
        return self._score_frame(frame, context)

    def what_if(self, order: dict, changes: dict, context: ScoringContext | None = None) -> dict:
        context = context or ScoringContext()
        new_order = {**(order or {}), **(changes or {})}
        base, new = self.score([order, new_order], context)
        return {"base": base, "new": new, "delta": round(new["probability"] - base["probability"], 4)}
