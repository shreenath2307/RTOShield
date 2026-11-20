"""Leakage-safe feature engineering for RTO risk.

Training features are built *as-of* each order: pincode, customer and
category statistics only use strictly earlier labelled orders (cumulative
counts minus the current row after a stable time sort). Pincode rates are
empirical-Bayes smoothed towards the public benchmark prior.

Sensitive attributes (income band, city/state names, region) are NEVER used
as features. Pincode tier and benchmark are logistics signals and are
monitored by the fairness guard instead.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import datetime
from functools import lru_cache
from typing import Any, Iterable

import numpy as np
import pandas as pd

from app.ml.seasonality import season_flags

# --------------------------------------------------------------------------
# Benchmarks (real module owned by data-integrations; local fallback)
# --------------------------------------------------------------------------
NATIONAL_COD = 0.27
NATIONAL_PREPAID = 0.06


def _fallback_meta(pincode: str) -> dict:
    p = _clean_pin(pincode)
    first = int(p[0]) if p and p[0].isdigit() else 0
    prefix = p[:3] if p else "000"
    # crude tier heuristic: metro prefixes tier1, hash rest
    metro = {"110", "400", "560", "600", "700", "500", "411", "380", "122", "201"}
    if prefix in metro:
        tier = 1
    else:
        tier = 2 + (sum(int(c) for c in prefix if c.isdigit()) % 2)
    mult = {1: 0.8, 2: 1.0, 3: 1.25}[tier]
    region = {1: "North", 2: "North", 3: "West", 4: "West", 5: "South", 6: "South",
              7: "East", 8: "East", 9: "Central", 0: "Central"}[first]
    return {
        "pincode_prefix": prefix, "state": None, "city": None, "region": region, "tier": tier,
        "lat": None, "lng": None, "income_band": {1: "high", 2: "mid", 3: "low"}[tier],
        "benchmark_rto_cod": round(NATIONAL_COD * mult, 4),
        "benchmark_rto_prepaid": round(NATIONAL_PREPAID * mult, 4),
        "pseudo_count": 30, "source": "national",
    }


def _clean_pin(pincode: Any) -> str:
    if pincode is None:
        return ""
    s = re.sub(r"\D", "", str(pincode))
    return s[:6]


@lru_cache(maxsize=20000)
def pincode_meta_safe(pincode: str) -> dict:
    """pincode_meta from app.data.benchmarks, falling back to a local heuristic."""
    try:
        from app.data.benchmarks import pincode_meta  # type: ignore
        m = dict(pincode_meta(str(pincode)))
        if m.get("benchmark_rto_cod") is None:
            raise ValueError("bad meta")
        return m
    except Exception:
        return _fallback_meta(str(pincode))


def benchmark_for(pincode: str, payment_method: str) -> float:
    m = pincode_meta_safe(_clean_pin(pincode))
    key = "benchmark_rto_cod" if str(payment_method).upper() == "COD" else "benchmark_rto_prepaid"
    v = m.get(key)
    try:
        v = float(v)
    except (TypeError, ValueError):
        v = NATIONAL_COD if key.endswith("cod") else NATIONAL_PREPAID
    return float(min(max(v, 0.005), 0.95))


# --------------------------------------------------------------------------
# Feature metadata
# --------------------------------------------------------------------------
FEATURES: list[str] = [
    "is_cod", "log_value", "value_band", "cod_x_log_value",
    "pin_smoothed_rate", "pin_support", "pin_tier", "pin_benchmark",
    "cust_prior_orders", "cust_prior_rto", "cust_trust", "is_new_customer", "days_since_last",
    "hour", "is_late_night", "weekday", "is_weekend",
    "category_rate", "quantity",
    "addr_quality", "addr_has_number", "addr_has_landmark",
    "phone_valid", "channel_risk",
    "is_festival", "is_monsoon", "is_sale",
]

FEATURE_LABELS: dict[str, str] = {
    "is_cod": "Cash on Delivery",
    "log_value": "Order value",
    "value_band": "Order value band",
    "cod_x_log_value": "High-value COD order",
    "pin_smoothed_rate": "Pincode RTO history",
    "pin_support": "Pincode order volume",
    "pin_tier": "Pincode tier",
    "pin_benchmark": "Pincode benchmark RTO",
    "cust_prior_orders": "Customer past orders",
    "cust_prior_rto": "Customer past RTOs",
    "cust_trust": "Customer trust score",
    "is_new_customer": "New customer",
    "days_since_last": "Days since last order",
    "hour": "Order hour",
    "is_late_night": "Late-night order",
    "weekday": "Day of week",
    "is_weekend": "Weekend order",
    "category_rate": "Product category risk",
    "quantity": "Quantity",
    "addr_quality": "Address quality",
    "addr_has_number": "House/flat number present",
    "addr_has_landmark": "Landmark present",
    "phone_valid": "Valid phone number",
    "channel_risk": "Sales channel",
    "is_festival": "Festival season",
    "is_monsoon": "Monsoon season",
    "is_sale": "Sale period",
}

# Human-level groups used for local explanations
FEATURE_GROUPS: dict[str, list[str]] = {
    "payment": ["is_cod"],
    "order_value": ["log_value", "value_band", "cod_x_log_value"],
    "pincode": ["pin_smoothed_rate", "pin_support", "pin_tier", "pin_benchmark"],
    "customer": ["cust_prior_orders", "cust_prior_rto", "cust_trust", "is_new_customer", "days_since_last"],
    "order_time": ["hour", "is_late_night", "weekday", "is_weekend"],
    "category": ["category_rate"],
    "quantity": ["quantity"],
    "address": ["addr_quality", "addr_has_number", "addr_has_landmark"],
    "phone": ["phone_valid"],
    "channel": ["channel_risk"],
    "season": ["is_festival", "is_monsoon", "is_sale"],
}
FEATURE_TO_GROUP = {f: g for g, fs in FEATURE_GROUPS.items() for f in fs}
PINCODE_FEATURES = FEATURE_GROUPS["pincode"]

CHANNEL_RISK = {"website": 0, "shopify": 0, "woocommerce": 0, "manual": 1, "whatsapp": 2, "instagram": 3}
VALUE_BANDS = [(0, 500, "low"), (500, 1500, "mid"), (1500, 3000, "high"), (3000, float("inf"), "premium")]

CATEGORY_PSEUDO = 30.0
CUST_TRUST_ALPHA = 4.0  # Beta prior: 4 delivered : 1 RTO => trust prior 0.8
CUST_TRUST_BETA = 1.0
PIN_PSEUDO_DEFAULT = 30.0


def value_band(v: float) -> int:
    for i, (lo, hi, _) in enumerate(VALUE_BANDS):
        if lo <= v < hi:
            return i
    return len(VALUE_BANDS) - 1


def value_band_name(v: float) -> str:
    return VALUE_BANDS[value_band(v)][2]


# --------------------------------------------------------------------------
# Address / phone quality
# --------------------------------------------------------------------------
_HOUSE_RE = re.compile(
    r"(\b(h\.?\s?no|house|flat|plot|door|d\.?\s?no|room|apt|apartment|block|sector|floor|bldg|building|"
    r"wing|qtr|quarter|shop|gali|lane|street|st|road|rd)\b[\s\.:#-]*\d*)|(#\s?\d+)|(^\s*\d+[\w/-]*)|(\b\d+[/-]\d+\b)",
    re.IGNORECASE,
)
_NUMBER_RE = re.compile(r"\d")
_LANDMARK_RE = re.compile(
    r"\b(near|opp|opposite|behind|beside|besides|next to|landmark|lm|adjacent|in front of|front of|"
    r"temple|mandir|masjid|church|school|hospital|bus stand|station|petrol pump|chowk|market)\b",
    re.IGNORECASE,
)
_JUNK_RE = re.compile(r"(test|asdf|qwer|xxx|abc\b|dummy|na\b|n/a|nil|none|\.\.\.|(.)\2{4,})", re.IGNORECASE)


def address_quality(address: Any) -> dict:
    """Heuristic deliverability score in [0, 1] plus components."""
    if address is None or (isinstance(address, float) and math.isnan(address)):
        return {"score": 0.0, "has_number": 0, "has_landmark": 0, "length": 0, "junk": 1}
    a = str(address).strip()
    if not a:
        return {"score": 0.0, "has_number": 0, "has_landmark": 0, "length": 0, "junk": 1}
    length = len(a)
    words = [w for w in re.split(r"[\s,]+", a) if w]
    has_number = 1 if (_HOUSE_RE.search(a) and _NUMBER_RE.search(a)) else 0
    has_landmark = 1 if _LANDMARK_RE.search(a) else 0
    digits = len(_NUMBER_RE.findall(a))
    letters = [c for c in a if c.isalpha()]
    uniq_ratio = len(set(a.lower())) / max(length, 1)
    junk = bool(_JUNK_RE.search(a)) or (length >= 8 and uniq_ratio < 0.2) or len(letters) < 3
    all_caps_short = a.isupper() and length < 20

    score = 0.0
    score += min(length, 40) / 40 * 0.3
    score += 0.3 * has_number
    score += 0.15 * has_landmark
    score += 0.1 * (1 if digits >= 1 else 0)
    score += 0.15 * min(len(words), 6) / 6
    if all_caps_short:
        score -= 0.1
    if junk:
        score *= 0.3
    return {"score": float(min(max(score, 0.0), 1.0)), "has_number": has_number,
            "has_landmark": has_landmark, "length": length, "junk": int(junk)}


def phone_valid(phone: Any) -> int:
    if phone is None or (isinstance(phone, float) and math.isnan(phone)):
        return 0
    d = re.sub(r"\D", "", str(phone))
    if len(d) == 12 and d.startswith("91"):
        d = d[2:]
    elif len(d) == 11 and d.startswith("0"):
        d = d[1:]
    if len(d) != 10 or d[0] not in "6789":
        return 0
    if len(set(d)) <= 2 or d in ("9876543210", "6789012345"):
        return 0
    return 1


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _to_dt(x: Any) -> datetime:
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return datetime.now()
    if isinstance(x, pd.Timestamp):
        if pd.isna(x):
            return datetime.now()
        x = x.tz_localize(None) if x.tzinfo else x
        return x.to_pydatetime()
    if isinstance(x, datetime):
        return x.replace(tzinfo=None) if x.tzinfo else x
    try:
        t = pd.Timestamp(x)
        if pd.isna(t):
            return datetime.now()
        if t.tzinfo:
            t = t.tz_convert("Asia/Kolkata").tz_localize(None)
        return t.to_pydatetime()
    except Exception:
        return datetime.now()


def mixed_benchmark(pincode: str, cod_share: float) -> float:
    return cod_share * benchmark_for(pincode, "COD") + (1 - cod_share) * benchmark_for(pincode, "PREPAID")


def pin_pseudo(pincode: str) -> float:
    try:
        k = float(pincode_meta_safe(_clean_pin(pincode)).get("pseudo_count") or PIN_PSEUDO_DEFAULT)
    except (TypeError, ValueError):
        k = PIN_PSEUDO_DEFAULT
    return float(min(max(k, 5.0), 200.0))


def pin_tier(pincode: str) -> int:
    try:
        return int(pincode_meta_safe(_clean_pin(pincode)).get("tier") or 2)
    except (TypeError, ValueError):
        return 2


def _static_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Row-local features that need no history."""
    out = pd.DataFrame(index=df.index)
    pay = df["payment_method"].astype(str).str.upper().str.strip()
    is_cod = (pay == "COD").astype(float)
    val = pd.to_numeric(df["order_value"], errors="coerce").fillna(0.0).clip(lower=0)
    out["is_cod"] = is_cod
    out["log_value"] = np.log1p(val)
    out["value_band"] = val.map(value_band).astype(float)
    out["cod_x_log_value"] = is_cod * out["log_value"]

    pins = df["pincode"].map(_clean_pin)
    bench_cod = pins.map(lambda p: benchmark_for(p, "COD"))
    bench_pre = pins.map(lambda p: benchmark_for(p, "PREPAID"))
    out["pin_benchmark"] = np.where(is_cod > 0, bench_cod, bench_pre).astype(float)
    out["pin_tier"] = pins.map(pin_tier).astype(float)

    dts = pd.to_datetime(df["order_date"], errors="coerce")
    out["hour"] = dts.dt.hour.fillna(12).astype(float)
    out["is_late_night"] = ((out["hour"] >= 22) | (out["hour"] < 5)).astype(float)
    out["weekday"] = dts.dt.day_of_week.fillna(2).astype(float)
    out["is_weekend"] = (out["weekday"] >= 5).astype(float)

    q = pd.to_numeric(df.get("quantity", pd.Series(1, index=df.index)), errors="coerce").fillna(1).clip(1, 50)
    out["quantity"] = q.astype(float)

    addr = df.get("address", pd.Series([None] * len(df), index=df.index)).map(address_quality)
    out["addr_quality"] = addr.map(lambda d: d["score"]).astype(float)
    out["addr_has_number"] = addr.map(lambda d: d["has_number"]).astype(float)
    out["addr_has_landmark"] = addr.map(lambda d: d["has_landmark"]).astype(float)

    phone = df.get("customer_phone", pd.Series([None] * len(df), index=df.index))
    out["phone_valid"] = phone.map(phone_valid).astype(float)
    ch = df.get("channel", pd.Series(["website"] * len(df), index=df.index)).astype(str).str.lower()
    out["channel_risk"] = ch.map(lambda c: CHANNEL_RISK.get(c, 1)).astype(float)

    days = dts.dt.date
    flags = days.map(lambda d: season_flags(d) if isinstance(d, type(datetime.now().date())) else season_flags(None))
    out["is_festival"] = flags.map(lambda f: float(f["is_festival_window"]))
    out["is_monsoon"] = flags.map(lambda f: float(f["is_monsoon"]))
    out["is_sale"] = flags.map(lambda f: float(f["is_sale_period"]))
    return out


def _finish(out: pd.DataFrame, pins: pd.Series, pin_n, pin_r, cod_share: float,
            cust_n, cust_r, cust_d, days_since, cat_n, cat_r, cat_prior: float) -> pd.DataFrame:
    pin_n = np.asarray(pin_n, dtype=float)
    pin_r = np.asarray(pin_r, dtype=float)
    prior = pins.map(lambda p: mixed_benchmark(p, cod_share)).to_numpy(dtype=float)
    k = pins.map(pin_pseudo).to_numpy(dtype=float)
    out["pin_smoothed_rate"] = (pin_r + k * prior) / (pin_n + k)
    out["pin_support"] = np.log1p(pin_n)

    cust_n = np.asarray(cust_n, dtype=float)
    cust_r = np.asarray(cust_r, dtype=float)
    cust_d = np.asarray(cust_d, dtype=float)
    out["cust_prior_orders"] = cust_n
    out["cust_prior_rto"] = cust_r
    out["cust_trust"] = (cust_d + CUST_TRUST_ALPHA) / (cust_d + cust_r + CUST_TRUST_ALPHA + CUST_TRUST_BETA)
    out["is_new_customer"] = (cust_n <= 0).astype(float)
    out["days_since_last"] = np.clip(np.nan_to_num(np.asarray(days_since, dtype=float), nan=365.0), 0, 365)

    cat_n = np.asarray(cat_n, dtype=float)
    cat_r = np.asarray(cat_r, dtype=float)
    out["category_rate"] = (cat_r + CATEGORY_PSEUDO * cat_prior) / (cat_n + CATEGORY_PSEUDO)
    return out[FEATURES].astype(float)


# --------------------------------------------------------------------------
# Training features (as-of, leakage-safe)
# --------------------------------------------------------------------------
@dataclass
class TrainingFrame:
    X: pd.DataFrame
    y: np.ndarray            # 1 = RTO, nan for unlabelled
    df: pd.DataFrame         # sorted canonical frame (same index order as X)
    snapshots: dict = field(default_factory=dict)


def _prep(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()
    d["order_date"] = pd.to_datetime(d["order_date"], errors="coerce")
    d = d[d["order_date"].notna()]
    d["pincode"] = d["pincode"].map(_clean_pin)
    d["customer_id"] = d["customer_id"].astype(str)
    d["product_category"] = d.get("product_category", pd.Series("other", index=d.index)).fillna("other").astype(str).str.lower()
    d = d.sort_values("order_date", kind="mergesort").reset_index(drop=True)
    return d


def build_training_features(df: pd.DataFrame) -> TrainingFrame:
    d = _prep(df)
    outcome = d["outcome"] if "outcome" in d.columns else pd.Series([None] * len(d))
    oc = outcome.astype(object).where(outcome.notna(), None).map(lambda o: str(o).upper() if o is not None else None)
    labelled = oc.isin(["RTO", "DELIVERED"]).to_numpy()
    y_full = np.where(labelled, (oc == "RTO").to_numpy().astype(float), np.nan)
    lab = labelled.astype(float)
    rto = np.nan_to_num(y_full, nan=0.0)
    dlv = lab - rto

    cod_share = float((d["payment_method"].astype(str).str.upper() == "COD").mean()) if len(d) else 0.6
    tmp = pd.DataFrame({"pin": d["pincode"], "cust": d["customer_id"], "cat": d["product_category"],
                        "lab": lab, "rto": rto, "dlv": dlv})

    def prior_cumsum(key: str, col: str) -> np.ndarray:
        return (tmp.groupby(key, sort=False)[col].cumsum() - tmp[col]).to_numpy()

    pin_n, pin_r = prior_cumsum("pin", "lab"), prior_cumsum("pin", "rto")
    cust_r, cust_d = prior_cumsum("cust", "rto"), prior_cumsum("cust", "dlv")
    cust_n = tmp.groupby("cust", sort=False).cumcount().to_numpy()
    last = d.groupby("customer_id", sort=False)["order_date"].shift(1)
    days_since = ((d["order_date"] - last).dt.total_seconds() / 86400.0).to_numpy()
    cat_n, cat_r = prior_cumsum("cat", "lab"), prior_cumsum("cat", "rto")
    # category prior: expanding global rate of earlier labelled orders (fallback benchmark mix)
    cum_lab = np.cumsum(lab) - lab
    cum_rto = np.cumsum(rto) - rto
    default_prior = cod_share * NATIONAL_COD + (1 - cod_share) * NATIONAL_PREPAID
    cat_prior_arr = (cum_rto + 50 * default_prior) / (cum_lab + 50)

    static = _static_columns(d)
    X = _finish(static, d["pincode"], pin_n, pin_r, cod_share, cust_n, cust_r, cust_d,
                days_since, cat_n, cat_r, 0.0)
    X["category_rate"] = (cat_r + CATEGORY_PSEUDO * cat_prior_arr) / (cat_n + CATEGORY_PSEUDO)

    snapshots = compute_snapshots(d, labelled, rto, dlv, cod_share)
    return TrainingFrame(X=X, y=y_full, df=d, snapshots=snapshots)


def compute_snapshots(d: pd.DataFrame, labelled: np.ndarray, rto: np.ndarray, dlv: np.ndarray,
                      cod_share: float) -> dict:
    """Final (full-history) stats, used when scoring new orders."""
    tmp = pd.DataFrame({"pin": d["pincode"].to_numpy(), "cust": d["customer_id"].to_numpy(),
                        "cat": d["product_category"].to_numpy(), "lab": labelled.astype(float),
                        "rto": rto, "dlv": dlv, "dt": d["order_date"].to_numpy()})
    pin = tmp.groupby("pin").agg(orders=("lab", "sum"), rto=("rto", "sum"))
    cust = tmp.groupby("cust").agg(orders=("lab", "size"), rto=("rto", "sum"), delivered=("dlv", "sum"),
                                   last_order_at=("dt", "max"))
    cat = tmp.groupby("cat").agg(orders=("lab", "sum"), rto=("rto", "sum"))
    n_lab = float(labelled.sum())
    global_rate = float(rto.sum() / n_lab) if n_lab else 0.2
    return {
        "pincode": {str(k): {"orders": int(v.orders), "rto": int(v.rto)} for k, v in pin.iterrows()},
        "customer": {str(k): {"orders": int(v.orders), "rto": int(v.rto), "delivered": int(v.delivered),
                              "last_order_at": pd.Timestamp(v.last_order_at).to_pydatetime(warn=False)}
                     for k, v in cust.iterrows()},
        "category": {str(k): {"orders": int(v.orders), "rto": int(v.rto)} for k, v in cat.iterrows()},
        "global_rate": global_rate,
        "cod_share": cod_share,
        "n_labelled": int(n_lab),
    }


# --------------------------------------------------------------------------
# Scoring features for new orders
# --------------------------------------------------------------------------
def orders_to_frame(orders: Iterable[dict]) -> pd.DataFrame:
    rows = []
    now = datetime.now()
    for o in orders:
        o = dict(o or {})
        rows.append({
            "order_id": o.get("order_id"),
            "order_date": _to_dt(o.get("order_date") or now),
            "customer_id": str(o.get("customer_id") or o.get("customer_phone") or "anonymous"),
            "customer_phone": o.get("customer_phone"),
            "pincode": _clean_pin(o.get("pincode")),
            "address": o.get("address"),
            "order_value": float(o.get("order_value") or 0.0),
            "payment_method": str(o.get("payment_method") or "COD").upper(),
            "product_category": str(o.get("product_category") or "other").lower(),
            "quantity": int(o.get("quantity") or 1),
            "channel": str(o.get("channel") or "website").lower(),
        })
    return pd.DataFrame(rows)


def build_scoring_features(frame: pd.DataFrame, pincode_stats: dict, customer_history: dict,
                           snapshots: dict | None = None) -> pd.DataFrame:
    """Features for new orders. Context stats take precedence over artifact snapshots."""
    snap = snapshots or {}
    snap_pin = snap.get("pincode", {})
    snap_cust = snap.get("customer", {})
    snap_cat = snap.get("category", {})
    cod_share = float(snap.get("cod_share", 0.65))
    global_rate = float(snap.get("global_rate", cod_share * NATIONAL_COD + (1 - cod_share) * NATIONAL_PREPAID))

    pin_n, pin_r, cust_n, cust_r, cust_d, days, cat_n, cat_r = ([] for _ in range(8))
    for _, row in frame.iterrows():
        ps = (pincode_stats or {}).get(row["pincode"]) or snap_pin.get(row["pincode"]) or {}
        pin_n.append(float(ps.get("orders", 0) or 0))
        pin_r.append(float(ps.get("rto", 0) or 0))
        ch = (customer_history or {}).get(row["customer_id"]) or snap_cust.get(row["customer_id"]) or {}
        n = float(ch.get("orders", 0) or 0)
        r = float(ch.get("rto", 0) or 0)
        dl = ch.get("delivered")
        dl = float(dl) if dl is not None else max(n - r, 0.0)
        cust_n.append(n)
        cust_r.append(r)
        cust_d.append(dl)
        lo = ch.get("last_order_at")
        if lo is not None and n > 0:
            dd = (row["order_date"] - _to_dt(lo)).total_seconds() / 86400.0
            days.append(max(dd, 0.0))
        else:
            days.append(np.nan)
        cs = snap_cat.get(row["product_category"]) or {}
        cat_n.append(float(cs.get("orders", 0) or 0))
        cat_r.append(float(cs.get("rto", 0) or 0))

    static = _static_columns(frame)
    return _finish(static, frame["pincode"], pin_n, pin_r, cod_share, cust_n, cust_r, cust_d,
                   days, cat_n, cat_r, global_rate)


def describe_group(group: str, feats: dict, raw: dict) -> tuple[str, str]:
    """Return (human label, display value) for an explanation group."""
    is_cod = feats.get("is_cod", 0) > 0.5
    if group == "payment":
        return ("Cash on Delivery", "COD") if is_cod else ("Prepaid payment", "Prepaid")
    if group == "order_value":
        v = float(raw.get("order_value") or 0)
        return f"Order value ₹{v:,.0f} ({value_band_name(v)} band)", f"₹{v:,.0f}"
    if group == "pincode":
        n = int(round(math.expm1(feats.get("pin_support", 0))))
        rate = feats.get("pin_smoothed_rate", 0)
        tier = int(feats.get("pin_tier", 2))
        if n < 5:
            return "Pincode area benchmark", f"{feats.get('pin_benchmark', 0):.0%} benchmark RTO · tier {tier}"
        return "Pincode RTO history", f"{rate:.0%} est. RTO · tier {tier} · {n} past orders"
    if group == "customer":
        if feats.get("is_new_customer", 0) > 0.5:
            return "New customer", "First order"
        n, r = int(feats.get("cust_prior_orders", 0)), int(feats.get("cust_prior_rto", 0))
        lbl = "Customer with past RTOs" if r > 0 else "Repeat customer"
        return lbl, f"{n} past orders, {r} RTO"
    if group == "order_time":
        dt = _to_dt(raw.get("order_date"))
        t = dt.strftime("%I:%M %p").lstrip("0")
        return f"Order placed {t}", t
    if group == "category":
        c = str(raw.get("product_category") or "other")
        return f"Category: {c}", c
    if group == "quantity":
        q = int(feats.get("quantity", 1))
        return f"Quantity {q}", str(q)
    if group == "address":
        s = feats.get("addr_quality", 0)
        lbl = "Incomplete address" if s < 0.55 else "Complete address"
        return lbl, f"Quality {s:.0%}"
    if group == "phone":
        return ("Valid phone number", "Valid") if feats.get("phone_valid", 0) > 0.5 else ("Invalid phone number", "Invalid")
    if group == "channel":
        c = str(raw.get("channel") or "website")
        return f"Channel: {c}", c
    if group == "season":
        f = season_flags(_to_dt(raw.get("order_date")))
        if f["is_festival_window"]:
            return "Festival season", f["festival_name"] or "Festival"
        if f["is_sale_period"]:
            return "Sale period", "Sale"
        if f["is_monsoon"]:
            return "Monsoon season", "Monsoon"
        return "Regular season", "—"
    return FEATURE_LABELS.get(group, group), ""
