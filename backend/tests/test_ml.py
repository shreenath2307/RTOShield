"""Tests for the ML package (training, scoring, fairness, drift)."""
from __future__ import annotations

import json
import time
from datetime import datetime

import numpy as np
import pandas as pd
import pytest

from app.ml.drift import drift_report
from app.ml.fairness import fairness_report
from app.ml.features import FEATURE_LABELS, FEATURES, address_quality, build_training_features, phone_valid
from app.ml.scorer import RiskScorer, ScoringContext
from app.ml.seasonality import season_flags
from app.ml.trainer import train


def _local_orders(n: int = 3000, seed: int = 0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    dates = pd.Timestamp("2025-10-01") + pd.to_timedelta(np.sort(rng.uniform(0, 365, n)), unit="D")
    cod = rng.random(n) < 0.6
    value = np.round(np.exp(rng.normal(7, 0.7, n)))
    pins = rng.choice(["110001", "400050", "560034", "845401", "247001", "799001", "682001"], n)
    pin_eff = pd.Series(pins).map({"110001": -0.4, "400050": -0.3, "560034": -0.4, "845401": 0.6,
                                   "247001": 0.4, "799001": 0.5, "682001": 0.0}).to_numpy()
    hour = dates.hour.to_numpy()
    good_addr = rng.random(n) < 0.7
    z = -2.8 + 1.7 * cod + 0.3 * np.log(value / 900) * cod + pin_eff + 0.7 * ((hour < 5)) + 0.6 * (~good_addr)
    y = rng.random(n) < 1 / (1 + np.exp(-z))
    return pd.DataFrame({
        "order_id": [f"O{i}" for i in range(n)], "order_date": dates,
        "customer_id": [f"C{int(c)}" for c in rng.integers(0, n // 2, n)],
        "customer_phone": ["98" + str(rng.integers(10**7, 10**8)) for _ in range(n)], "customer_name": "X",
        "pincode": pins, "city": None, "state": None,
        "address": np.where(good_addr, "Flat 12, House No 45, MG Road near temple", "near market"),
        "order_value": value, "payment_method": np.where(cod, "COD", "PREPAID"),
        "product_category": rng.choice(["fashion", "electronics", "beauty"], n), "sku": None,
        "quantity": 1, "channel": "shopify", "outcome": np.where(y, "RTO", "DELIVERED"),
    })


@pytest.fixture(scope="module")
def orders() -> pd.DataFrame:
    try:
        from app.data.synthetic import generate_orders
        return generate_orders(n=4000, seed=11)
    except Exception:
        return _local_orders(4000)


@pytest.fixture(scope="module")
def trained(orders, tmp_path_factory):
    d = tmp_path_factory.mktemp("artifacts")
    t0 = time.time()
    report = train(orders, "test-seller", d)
    report["_elapsed"] = time.time() - t0
    return report


def _sample_order(**kw) -> dict:
    o = {"order_id": "T1", "order_date": datetime(2026, 11, 20, 1, 42), "customer_id": "BRAND-NEW-1",
         "customer_phone": "9876501234", "pincode": "845401", "address": "near temple",
         "order_value": 3499.0, "payment_method": "COD", "product_category": "fashion", "quantity": 1,
         "channel": "instagram"}
    o.update(kw)
    return o


def test_seasonality():
    f = season_flags(datetime(2025, 10, 18))
    assert f["is_festival_window"] and f["festival_name"] == "Diwali"
    assert season_flags(datetime(2025, 7, 15))["is_monsoon"]
    assert not season_flags(datetime(2025, 2, 10))["is_festival_window"]


def test_feature_helpers():
    assert phone_valid("+91 98765 01234") == 1
    assert phone_valid("12345") == 0
    assert phone_valid("9999999999") == 0
    assert address_quality("Flat 402, House No 12, MG Road, near City Mall")["score"] > \
        address_quality("near market")["score"]
    assert address_quality(None)["score"] == 0.0
    assert set(FEATURES) <= set(FEATURE_LABELS)


def test_features_leakage_safe(orders):
    tf = build_training_features(orders)
    assert list(tf.X.columns) == FEATURES
    assert not tf.X.isna().any().any()
    # first order of every customer must have no history
    first = ~tf.df["customer_id"].duplicated()
    assert (tf.X.loc[first.to_numpy(), "cust_prior_orders"] == 0).all()
    # changing the outcome of the last order must not change its own features
    o2 = tf.df.copy()
    o2.loc[o2.index[-1], "outcome"] = "RTO" if o2["outcome"].iloc[-1] == "DELIVERED" else "DELIVERED"
    tf2 = build_training_features(o2)
    pd.testing.assert_series_equal(tf.X.iloc[-1], tf2.X.iloc[-1])


def test_train_report(trained):
    r = trained
    assert r["_elapsed"] < 30
    assert r["split"] == "time-based"
    assert r["metrics"]["roc_auc"] > 0.65
    for k in ["version", "trained_at", "algorithm", "n_train", "n_test", "base_rate", "baselines", "calibration",
              "pr_curve", "roc_curve", "feature_importance", "thresholds", "cost_curve", "confusion_high", "artifact_path"]:
        assert k in r
    assert r["version"].startswith("v1-")
    assert len(r["pr_curve"]) <= 100 and len(r["roc_curve"]) <= 100
    assert 0 < r["thresholds"]["medium"] < r["thresholds"]["high"] < 1
    assert r["feature_importance"][0]["label"]
    json.dumps({k: v for k, v in r.items() if k != "_elapsed"}, allow_nan=False)


def test_train_rejects_small():
    df = _local_orders(150)
    with pytest.raises(ValueError):
        train(df, "x", __import__("pathlib").Path("."))


def _check_pred(p: dict):
    assert 0 < p["probability"] < 1
    assert p["tier"] in {"low", "medium", "high"}
    assert p["confidence"] in {"low", "medium", "high"}
    assert isinstance(p["reasons"], list) and len(p["reasons"]) <= 6
    for r in p["reasons"]:
        assert set(r) >= {"feature", "label", "value", "impact", "direction"}
        assert r["direction"] in {"up", "down"}
    assert 0 <= p["pincode_share"] <= 1
    assert isinstance(p["fairness_adjusted"], bool)
    json.dumps(p, allow_nan=False)


def test_scorer_trained(trained):
    s = RiskScorer.load(trained["artifact_path"])
    assert not s.is_cold_start and s.version == trained["version"]
    ctx = ScoringContext(n_seller_labelled=4000)
    out = s.score([_sample_order(), _sample_order(payment_method="PREPAID", order_value=499.0)], ctx)
    assert len(out) == 2
    for p in out:
        _check_pred(p)
        assert p["model_version"] == trained["version"]
    t0 = time.time()
    for _ in range(10):
        s.score([_sample_order()], ctx)
    assert (time.time() - t0) / 10 < 0.05


def test_cold_start():
    s = RiskScorer.cold_start()
    assert s.is_cold_start
    risky, safe = s.score([_sample_order(), _sample_order(payment_method="PREPAID", order_value=399.0,
                                                          order_date=datetime(2026, 3, 3, 14, 0),
                                                          address="Flat 12, House No 4, MG Road, near temple",
                                                          pincode="560034", channel="website")], ScoringContext())
    _check_pred(risky)
    _check_pred(safe)
    assert risky["cold_start"] is True
    assert risky["probability"] > safe["probability"]
    assert 0.02 < safe["probability"] < 0.3
    labels = " ".join(r["label"] for r in risky["reasons"])
    assert "Cash on Delivery" in labels or "Order placed" in labels


def test_what_if_prepaid(trained):
    for s in (RiskScorer.load(trained["artifact_path"]), RiskScorer.cold_start()):
        res = s.what_if(_sample_order(), {"payment_method": "PREPAID"}, ScoringContext(n_seller_labelled=4000))
        assert res["delta"] < 0
        assert res["new"]["probability"] < res["base"]["probability"]


def test_fairness_guard():
    s = RiskScorer.cold_start()
    ctx = ScoringContext(pincode_stats={"845401": {"orders": 400, "rto": 300}}, thresholds={"medium": 0.1, "high": 0.3},
                         pincode_cap=0.35)
    p = s.score([_sample_order(order_date=datetime(2026, 3, 3, 14, 0), payment_method="COD", order_value=799.0,
                               address="Flat 12, House No 4, MG Road, near temple", channel="website",
                               customer_id="REG")],
                ScoringContext(**{**ctx.__dict__, "customer_history": {"REG": {"orders": 5, "rto": 0, "delivered": 5}}}))[0]
    assert p["pincode_share"] > 0.35
    assert p["probability"] >= 0.3  # would be high on probability alone...
    assert p["fairness_adjusted"] and p["tier"] == "medium"  # ...but only because of pincode


def test_fairness_report(orders, trained):
    s = RiskScorer.load(trained["artifact_path"])
    sub = orders.tail(800).reset_index(drop=True)
    preds = s.score(sub.to_dict("records"), ScoringContext(n_seller_labelled=4000))
    df = sub.assign(probability=[p["probability"] for p in preds], tier=[p["tier"] for p in preds])
    rep = fairness_report(df)
    assert rep["status"] in {"pass", "warn", "fail"}
    assert {"income_band", "tier", "region"} <= set(rep["groups"])
    assert rep["findings"] and rep["recommendations"]
    assert "roc_auc_blind" in rep["pincode_blind"]
    json.dumps(rep, allow_nan=False)


def test_drift(orders):
    ref, cur = orders.iloc[:2000], orders.iloc[2000:]
    rep = drift_report(ref, cur)
    assert {"overall_psi", "features", "rto_rate_reference", "rto_rate_current", "retrain_recommended",
            "reasons", "season"} <= set(rep)
    assert all(f["status"] in {"stable", "moderate", "drift"} for f in rep["features"])
    shifted = cur.copy()
    shifted["payment_method"] = "COD"
    shifted["order_value"] = shifted["order_value"] * 4
    rep2 = drift_report(ref, shifted)
    assert rep2["overall_psi"] > rep["overall_psi"]
    assert rep2["retrain_recommended"]
    json.dumps(rep2, allow_nan=False)
