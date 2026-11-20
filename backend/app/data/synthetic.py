"""Synthetic Indian D2C order generator with a realistic causal RTO structure.

Outcome model (latent logistic): logit(p) = logit(pincode benchmark for payment method)
  + value effect (strong for COD) + new-customer + late-night + address quality + invalid phone
  + festival / monsoon season + category + channel + bulk quantity - customer reliability (latent,
  persistent per repeat customer) + per-payment intercept calibrated so that the overall
  COD RTO ~ 27% and prepaid ~ 5.5%.
Everything is vectorised numpy; deterministic for a given seed.
"""
from __future__ import annotations

from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from app.data.benchmarks import load_pincode_benchmarks

CANONICAL_COLUMNS = [
    "order_id", "order_date", "customer_id", "customer_phone", "customer_name",
    "pincode", "city", "state", "address", "order_value", "payment_method",
    "product_category", "sku", "quantity", "channel", "outcome",
]

FIRST_NAMES = np.array([
    "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Ayaan", "Krishna", "Ishaan",
    "Rohan", "Rahul", "Amit", "Suresh", "Ramesh", "Vikas", "Manoj", "Deepak", "Sanjay", "Ankit",
    "Priya", "Ananya", "Diya", "Saanvi", "Aadhya", "Pooja", "Neha", "Sneha", "Kavya", "Riya",
    "Anjali", "Sunita", "Meena", "Lakshmi", "Divya", "Swati", "Nisha", "Shreya", "Ritu", "Komal",
    "Mohammed", "Imran", "Ayesha", "Fatima", "Harpreet", "Gurpreet", "Simran", "Joseph", "Mary", "Arun",
    "Karthik", "Venkatesh", "Lalitha", "Bhavana", "Sourav", "Debjani", "Bikash", "Pallavi", "Tanvi", "Yash",
])
LAST_NAMES = np.array([
    "Sharma", "Verma", "Gupta", "Singh", "Kumar", "Yadav", "Patel", "Shah", "Mehta", "Joshi",
    "Reddy", "Rao", "Naidu", "Iyer", "Nair", "Menon", "Pillai", "Das", "Ghosh", "Banerjee",
    "Mukherjee", "Chatterjee", "Mishra", "Tiwari", "Pandey", "Chauhan", "Rathore", "Jain", "Agarwal", "Bansal",
    "Khan", "Ahmed", "Sheikh", "Ansari", "Gill", "Sandhu", "Kaur", "Desai", "Kulkarni", "Patil",
    "Pawar", "Jadhav", "Bhat", "Hegde", "Sahu", "Mohanty", "Behera", "Borah", "Saikia", "Thomas",
])
STREETS = np.array([
    "MG Road", "Station Road", "Gandhi Nagar", "Nehru Colony", "Shastri Nagar", "Main Bazaar",
    "Sector 15", "Sector 62", "Civil Lines", "Rajendra Nagar", "Ashok Vihar", "Model Town",
    "Indira Nagar", "Laxmi Nagar", "Patel Chowk", "Anna Nagar", "Jayanagar 4th Block", "Salt Lake Sector 2",
    "Kothrud", "Andheri East", "Bani Park", "Gomti Nagar", "Boring Road", "Banjara Hills",
])
LANDMARKS = np.array(["near temple", "near bus stand", "opp school", "behind market", "near water tank",
                      "near masjid", "near petrol pump", "gali no 3"])

CATEGORIES = np.array(["Fashion", "Footwear", "Electronics", "Beauty", "Home & Kitchen",
                       "Grocery", "Accessories", "Health"])
CAT_WEIGHTS = np.array([0.27, 0.12, 0.12, 0.14, 0.11, 0.07, 0.10, 0.07])
CAT_MEDIAN_VALUE = np.array([899, 1299, 2199, 549, 999, 449, 649, 799], dtype=float)
CAT_SIGMA = np.array([0.55, 0.45, 0.70, 0.50, 0.55, 0.45, 0.55, 0.45])
CAT_EFFECT = np.array([0.32, 0.24, -0.20, -0.25, 0.0, -0.35, 0.08, -0.10])
CAT_CODE = np.array(["FSH", "FTW", "ELC", "BTY", "HMK", "GRC", "ACC", "HLT"])

CHANNELS = np.array(["website", "shopify", "instagram", "whatsapp", "woocommerce", "manual"])
CHANNEL_W = np.array([0.28, 0.30, 0.16, 0.10, 0.11, 0.05])
CHANNEL_EFFECT = np.array([0.0, 0.0, 0.30, 0.18, 0.0, -0.10])

# hour-of-day order volume (IST) - evening peak, some night orders
HOUR_W = np.array([2.0, 1.5, 1.1, 0.8, 0.6, 0.6, 1.0, 2.0, 3.0, 4.0, 5.0, 5.5,
                   6.0, 5.8, 5.2, 5.0, 5.0, 5.4, 6.0, 6.8, 7.4, 7.6, 6.4, 4.0])
HOUR_W = HOUR_W / HOUR_W.sum()

TARGET_COD_RTO = 0.275
TARGET_PREPAID_RTO = 0.055


def _logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def _phones(rng: np.random.Generator, n: int) -> np.ndarray:
    first = rng.choice(np.array(["6", "7", "8", "9"]), size=n, p=[0.1, 0.25, 0.25, 0.4])
    rest = rng.integers(0, 10**9, size=n)
    phones = np.char.add(first, np.char.zfill(rest.astype(str), 9))
    bad = rng.random(n) < 0.04
    if bad.any():
        kinds = rng.integers(0, 3, size=n)
        short = np.char.zfill(rng.integers(0, 10**8, size=n).astype(str), 8)
        starts_low = np.char.add("1", np.char.zfill(rest.astype(str), 9))
        rep = np.full(n, "9999999999")
        badvals = np.where(kinds == 0, short, np.where(kinds == 1, starts_low, rep))
        phones = np.where(bad, badvals, phones)
    return phones


def _addresses(rng: np.random.Generator, n: int, city: np.ndarray):
    """Return (address strings, quality score 0=good,1=medium,2=poor)."""
    q = rng.choice(3, size=n, p=[0.62, 0.25, 0.13])
    house = rng.integers(1, 999, size=n).astype(str)
    flat = np.char.add(np.char.add("Flat ", rng.integers(101, 1204, size=n).astype(str)), ", ")
    street = rng.choice(STREETS, size=n)
    lm = rng.choice(LANDMARKS, size=n)
    good = np.char.add(np.char.add(np.char.add(np.char.add(flat, "House No "), house), ", "), street)
    good = np.char.add(np.char.add(good, ", "), city.astype(str))
    medium = np.char.add(np.char.add(street, ", "), city.astype(str))
    poor = np.where(rng.random(n) < 0.5, lm, np.char.add(np.char.add(lm, " "), city.astype(str)))
    addr = np.where(q == 0, good, np.where(q == 1, medium, poor))
    return addr.astype(object), q


def _season_effect(dates: pd.DatetimeIndex) -> np.ndarray:
    m = dates.month.values
    eff = np.zeros(len(dates))
    eff += np.where(np.isin(m, [10, 11]), 0.20, 0.0)        # festival window
    eff += np.where(np.isin(m, [6, 7, 8, 9]), 0.15, 0.0)    # monsoon
    return eff


def _build(n: int, rng: np.random.Generator, dates: pd.DatetimeIndex, *, repeat_share: float = 0.30,
           id_prefix: str = "SO", start_idx: int = 100001, live: bool = False) -> tuple[pd.DataFrame, np.ndarray]:
    bm = load_pincode_benchmarks()
    tw = bm["tier"].map({1: 6.0, 2: 2.2, 3: 0.75}).to_numpy()
    tw = tw / tw.sum()

    # ---- customer pool (repeat customers with persistent reliability) ----
    n_pool = max(1, int(n * repeat_share / 2.6))
    pool_pin_idx = rng.choice(len(bm), size=n_pool, p=tw)
    pool_suffix = rng.integers(1, 100, size=n_pool)
    pool_rel = rng.normal(0.25, 0.8, size=n_pool)  # repeat buyers slightly more reliable on average
    pool_first = rng.choice(FIRST_NAMES, size=n_pool)
    pool_last = rng.choice(LAST_NAMES, size=n_pool)
    pool_phone = _phones(rng, n_pool)
    pool_ids = np.char.add("CUST", np.char.zfill(np.arange(1, n_pool + 1).astype(str), 6))
    if live:
        pool_ids = np.char.add("CUSTL", rng.integers(10**6, 10**7, size=n_pool).astype(str))

    is_repeat = rng.random(n) < repeat_share
    pool_pick = rng.integers(0, n_pool, size=n)
    # skewed pool popularity: some customers order often
    pool_pick = np.minimum((rng.pareto(1.6, size=n) * n_pool / 6).astype(int), n_pool - 1)
    pool_pick = (pool_pick + rng.integers(0, n_pool, size=n) * (rng.random(n) < 0.5)) % n_pool

    new_pin_idx = rng.choice(len(bm), size=n, p=tw)
    pin_idx = np.where(is_repeat, pool_pin_idx[pool_pick], new_pin_idx)
    suffix = np.where(is_repeat, pool_suffix[pool_pick], rng.integers(1, 100, size=n))
    prefixes = bm["pincode_prefix"].to_numpy()[pin_idx]
    pincode = np.char.add(prefixes.astype(str), np.char.zfill(suffix.astype(str), 3))
    city = bm["city"].to_numpy()[pin_idx].astype(str)
    state = bm["state"].to_numpy()[pin_idx]
    tier = bm["tier"].to_numpy()[pin_idx]
    b_cod = bm["benchmark_rto_cod"].to_numpy()[pin_idx]
    b_pre = bm["benchmark_rto_prepaid"].to_numpy()[pin_idx]

    first = np.where(is_repeat, pool_first[pool_pick], rng.choice(FIRST_NAMES, size=n))
    last = np.where(is_repeat, pool_last[pool_pick], rng.choice(LAST_NAMES, size=n))
    name = np.char.add(np.char.add(first.astype(str), " "), last.astype(str))
    phone = np.where(is_repeat, pool_phone[pool_pick], _phones(rng, n))
    if live:
        new_ids = np.char.add("CUSTN", rng.integers(10**8, 10**9, size=n).astype(str))
    else:
        new_ids = np.char.add("CUSTN", np.char.zfill(np.arange(1, n + 1).astype(str), 6))
    cust_id = np.where(is_repeat, pool_ids[pool_pick], new_ids)
    reliability = np.where(is_repeat, pool_rel[pool_pick], rng.normal(0.0, 0.6, size=n))
    # "new customer" = first chronological order of this customer id
    is_first = ~is_repeat if live else ~pd.Series(cust_id).duplicated().to_numpy()

    address, addr_q = _addresses(rng, n, city)
    phone_valid = np.array([len(p) == 10 and p[0] in "6789" and p != "9999999999" for p in phone])

    # ---- product ----
    cat_idx = rng.choice(len(CATEGORIES), size=n, p=CAT_WEIGHTS)
    raw_val = np.exp(np.log(CAT_MEDIAN_VALUE[cat_idx]) + rng.normal(0, 1, size=n) * CAT_SIGMA[cat_idx])
    qty = 1 + rng.binomial(3, 0.12, size=n) + (rng.random(n) < 0.03) * rng.integers(2, 6, size=n)
    value = np.maximum(149.0, np.round(raw_val * (1 + 0.6 * (qty - 1)) / 50) * 50 - 1)
    sku = np.char.add(np.char.add(CAT_CODE[cat_idx], "-"), rng.integers(1000, 9999, size=n).astype(str))
    channel_idx = rng.choice(len(CHANNELS), size=n, p=CHANNEL_W)

    # ---- payment method: COD more likely in tier 3, low values, new customers ----
    cod_logit = (0.05 + np.select([tier == 1, tier == 2], [-0.45, 0.15], 0.75)
                 - 0.35 * np.log(value / 1000.0) + 0.25 * is_first + 0.3 * (channel_idx == 3))
    is_cod = rng.random(n) < _sigmoid(cod_logit)

    hours = dates.hour.values
    night = (hours >= 0) & (hours < 5)
    late = (hours >= 22) | (hours == 5)

    # ---- outcome latent model ----
    base = np.where(is_cod, _logit(b_cod), _logit(b_pre))
    v = np.log(value / 900.0)
    eff = (np.where(is_cod, 0.45, 0.10) * v
           + 0.40 * is_first
           + np.where(night, 0.75, np.where(late, 0.20, 0.0))
           + np.select([addr_q == 1, addr_q == 2], [0.25, 0.65], 0.0)
           + 0.55 * (~phone_valid)
           + _season_effect(dates)
           + CAT_EFFECT[cat_idx]
           + CHANNEL_EFFECT[channel_idx]
           + 0.15 * (qty >= 3)
           - 0.75 * reliability)
    logits = base + eff
    # calibrate per-payment intercepts so aggregate rates hit targets
    for mask, target in ((is_cod, TARGET_COD_RTO), (~is_cod, TARGET_PREPAID_RTO)):
        if mask.sum() == 0 or live:
            continue
        lo, hi = -4.0, 4.0
        for _ in range(30):
            mid = (lo + hi) / 2
            if _sigmoid(logits[mask] + mid).mean() > target:
                hi = mid
            else:
                lo = mid
        logits[mask] += (lo + hi) / 2
    if live:  # use typical offsets (approx. what calibration yields)
        logits += np.where(is_cod, -0.55, -0.35)
    p = _sigmoid(logits)

    df = pd.DataFrame({
        "order_id": None,
        "order_date": dates,
        "customer_id": cust_id.astype(object),
        "customer_phone": phone.astype(object),
        "customer_name": name.astype(object),
        "pincode": pincode.astype(object),
        "city": city.astype(object),
        "state": state.astype(object),
        "address": address,
        "order_value": value.astype(float),
        "payment_method": np.where(is_cod, "COD", "PREPAID").astype(object),
        "product_category": CATEGORIES[cat_idx].astype(object),
        "sku": sku.astype(object),
        "quantity": qty.astype(int),
        "channel": CHANNELS[channel_idx].astype(object),
        "outcome": None,
    })
    return df, p


def _random_dates(rng: np.random.Generator, n: int, start: str, days: int) -> pd.DatetimeIndex:
    # growing business + festival volume bump
    day_w = np.linspace(0.7, 1.3, days)
    d0 = pd.Timestamp(start)
    months = (d0 + pd.to_timedelta(np.arange(days), unit="D")).month
    day_w = day_w * np.where(np.isin(months, [10, 11]), 1.35, 1.0)
    day_w = day_w / day_w.sum()
    day = rng.choice(days, size=n, p=day_w)
    hour = rng.choice(24, size=n, p=HOUR_W)
    secs = rng.integers(0, 3600, size=n)
    offs = day.astype("int64") * 86400 + hour.astype("int64") * 3600 + secs
    return pd.DatetimeIndex(d0 + pd.to_timedelta(np.sort(offs), unit="s"))


def generate_orders(n: int = 8000, seed: int = 42, start: str = "2025-10-01", days: int = 395,
                    with_outcome: bool = True) -> pd.DataFrame:
    """Generate ``n`` canonical orders sorted by order_date (deterministic per seed)."""
    rng = np.random.default_rng(seed)
    dates = _random_dates(rng, n, start, max(1, int(days)))
    df, p = _build(n, rng, dates)
    df["order_id"] = np.char.add("SO", (100001 + np.arange(n)).astype(str)).astype(object)
    if with_outcome:
        rto = rng.random(n) < p
        df["outcome"] = np.where(rto, "RTO", "DELIVERED").astype(object)
    else:
        df["outcome"] = None
    df["order_date"] = pd.to_datetime(df["order_date"])
    return df[CANONICAL_COLUMNS].reset_index(drop=True)


def generate_live_order(rng: np.random.Generator | None = None, now: datetime | None = None) -> dict:
    """A single fresh canonical order (outcome None) placed at ``now`` (default: current time)."""
    rng = rng if rng is not None else np.random.default_rng()
    now = now or datetime.now()
    now = now.replace(tzinfo=None, microsecond=0)
    df, _ = _build(1, rng, pd.DatetimeIndex([pd.Timestamp(now)]), repeat_share=0.3, live=True)
    rec = df.iloc[0].to_dict()
    rec["order_id"] = "LV" + "".join(rng.choice(list("0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"), size=8))
    rec["order_date"] = now
    rec["order_value"] = float(rec["order_value"])
    rec["quantity"] = int(rec["quantity"])
    rec["outcome"] = None
    return {k: rec[k] for k in CANONICAL_COLUMNS}


__all__ = ["generate_orders", "generate_live_order", "CANONICAL_COLUMNS"]
