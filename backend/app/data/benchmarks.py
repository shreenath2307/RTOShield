"""Pincode-level RTO benchmarks (cold-start priors).

IMPORTANT: the figures in ``pincode_benchmarks.csv`` are ILLUSTRATIVE, industry-style
benchmarks aggregated by region / city tier (consistent with publicly discussed Indian
e-commerce ranges: COD RTO ~15-20% in metros, 20-30% tier-2, 25-40% tier-3 / North-East /
remote; prepaid ~3-8%). They are NOT courier-published data and should be replaced with
courier / aggregator pincode RTO statistics before production use.

Lookup fallback chain: 3-digit prefix -> 2-digit postal-circle ("state") aggregate -> national.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import re

import pandas as pd

_CSV = Path(__file__).with_name("pincode_benchmarks.csv")

# 2-digit postal-circle -> (state, region). Used for the "state" fallback when a 3-digit
# prefix is not in the table. Some circles span multiple states; this is the dominant one.
STATE_BY_2DIGIT: dict[str, tuple[str, str]] = {
    "11": ("Delhi", "North"),
    "12": ("Haryana", "North"), "13": ("Haryana", "North"),
    "14": ("Punjab", "North"), "15": ("Punjab", "North"),
    "16": ("Chandigarh", "North"),
    "17": ("Himachal Pradesh", "North"),
    "18": ("Jammu and Kashmir", "North"), "19": ("Jammu and Kashmir", "North"),
    "20": ("Uttar Pradesh", "North"), "21": ("Uttar Pradesh", "North"), "22": ("Uttar Pradesh", "North"),
    "23": ("Uttar Pradesh", "North"), "24": ("Uttar Pradesh", "North"), "25": ("Uttar Pradesh", "North"),
    "26": ("Uttar Pradesh", "North"), "27": ("Uttar Pradesh", "North"), "28": ("Uttar Pradesh", "North"),
    "30": ("Rajasthan", "North"), "31": ("Rajasthan", "North"), "32": ("Rajasthan", "North"),
    "33": ("Rajasthan", "North"), "34": ("Rajasthan", "North"),
    "36": ("Gujarat", "West"), "37": ("Gujarat", "West"), "38": ("Gujarat", "West"), "39": ("Gujarat", "West"),
    "40": ("Maharashtra", "West"), "41": ("Maharashtra", "West"), "42": ("Maharashtra", "West"),
    "43": ("Maharashtra", "West"), "44": ("Maharashtra", "Central"),
    "45": ("Madhya Pradesh", "Central"), "46": ("Madhya Pradesh", "Central"),
    "47": ("Madhya Pradesh", "Central"), "48": ("Madhya Pradesh", "Central"),
    "49": ("Chhattisgarh", "Central"),
    "50": ("Telangana", "South"),
    "51": ("Andhra Pradesh", "South"), "52": ("Andhra Pradesh", "South"), "53": ("Andhra Pradesh", "South"),
    "56": ("Karnataka", "South"), "57": ("Karnataka", "South"), "58": ("Karnataka", "South"), "59": ("Karnataka", "South"),
    "60": ("Tamil Nadu", "South"), "61": ("Tamil Nadu", "South"), "62": ("Tamil Nadu", "South"),
    "63": ("Tamil Nadu", "South"), "64": ("Tamil Nadu", "South"),
    "67": ("Kerala", "South"), "68": ("Kerala", "South"), "69": ("Kerala", "South"),
    "70": ("West Bengal", "East"), "71": ("West Bengal", "East"), "72": ("West Bengal", "East"),
    "73": ("West Bengal", "East"), "74": ("West Bengal", "East"),
    "75": ("Odisha", "East"), "76": ("Odisha", "East"), "77": ("Odisha", "East"),
    "78": ("Assam", "NorthEast"), "79": ("Assam", "NorthEast"),
    "80": ("Bihar", "East"), "81": ("Bihar", "East"), "82": ("Bihar", "East"),
    "83": ("Jharkhand", "East"), "84": ("Bihar", "East"), "85": ("Bihar", "East"),
}

# Special 5-digit areas sharing a 3-digit prefix with a neighbouring state (UTs).
SPECIAL_AREAS: dict[str, dict] = {
    "68255": {"state": "Lakshadweep", "city": "Kavaratti", "region": "South", "tier": 3,
              "lat": 10.57, "lng": 72.64, "income_band": "mid",
              "benchmark_rto_cod": 0.40, "benchmark_rto_prepaid": 0.085, "pseudo_count": 30},
    "39621": {"state": "Dadra and Nagar Haveli and Daman and Diu", "city": "Daman", "region": "West",
              "tier": 3, "lat": 20.40, "lng": 72.83, "income_band": "mid",
              "benchmark_rto_cod": 0.27, "benchmark_rto_prepaid": 0.05, "pseudo_count": 50},
    "39623": {"state": "Dadra and Nagar Haveli and Daman and Diu", "city": "Silvassa", "region": "West",
              "tier": 3, "lat": 20.27, "lng": 73.01, "income_band": "mid",
              "benchmark_rto_cod": 0.28, "benchmark_rto_prepaid": 0.05, "pseudo_count": 50},
}

# National fallback (illustrative): blended Indian D2C averages.
NATIONAL: dict = {
    "pincode_prefix": None, "state": None, "city": None, "region": None, "tier": 2,
    "lat": 22.5, "lng": 79.0, "income_band": "mid",
    "benchmark_rto_cod": 0.27, "benchmark_rto_prepaid": 0.055, "pseudo_count": 20,
}

_META_KEYS = ["pincode_prefix", "state", "city", "region", "tier", "lat", "lng", "income_band",
              "benchmark_rto_cod", "benchmark_rto_prepaid", "pseudo_count"]


@lru_cache(maxsize=1)
def load_pincode_benchmarks() -> pd.DataFrame:
    """Return the benchmark table (one row per 3-digit pincode prefix)."""
    df = pd.read_csv(_CSV, comment="#", dtype={"pincode_prefix": str})
    df["pincode_prefix"] = df["pincode_prefix"].str.zfill(3)
    df["tier"] = df["tier"].astype(int)
    df["pseudo_count"] = df["pseudo_count"].astype(int)
    for c in ("lat", "lng", "benchmark_rto_cod", "benchmark_rto_prepaid"):
        df[c] = df[c].astype(float)
    return df.reset_index(drop=True)


@lru_cache(maxsize=1)
def _prefix_index() -> dict[str, dict]:
    return {r["pincode_prefix"]: r for r in load_pincode_benchmarks().to_dict("records")}


@lru_cache(maxsize=1)
def _state_index() -> dict[str, dict]:
    """2-digit aggregates (pseudo_count-weighted means of the prefixes in that circle)."""
    df = load_pincode_benchmarks().copy()
    df["p2"] = df["pincode_prefix"].str[:2]
    out: dict[str, dict] = {}
    for p2, g in df.groupby("p2"):
        w = g["pseudo_count"].astype(float)
        state, region = STATE_BY_2DIGIT.get(p2, (g["state"].mode().iat[0], g["region"].mode().iat[0]))
        out[p2] = {
            "pincode_prefix": None, "state": state, "city": None, "region": region,
            "tier": int(round(float(g["tier"].median()))),
            "lat": float(g["lat"].mean()), "lng": float(g["lng"].mean()),
            "income_band": str(g["income_band"].mode().iat[0]),
            "benchmark_rto_cod": round(float((g["benchmark_rto_cod"] * w).sum() / w.sum()), 4),
            "benchmark_rto_prepaid": round(float((g["benchmark_rto_prepaid"] * w).sum() / w.sum()), 4),
            "pseudo_count": max(10, int(w.mean() / 2)),
        }
    for p2, (state, region) in STATE_BY_2DIGIT.items():
        if p2 not in out:
            # circle without listed prefixes: use region-average of what we have
            reg = df[df["region"] == region]
            base = dict(NATIONAL)
            if len(reg):
                base.update(benchmark_rto_cod=round(float(reg["benchmark_rto_cod"].mean()), 4),
                            benchmark_rto_prepaid=round(float(reg["benchmark_rto_prepaid"].mean()), 4),
                            lat=float(reg["lat"].mean()), lng=float(reg["lng"].mean()))
            base.update(state=state, region=region, tier=3, pseudo_count=10)
            out[p2] = base
    return out


def _clean_pincode(pincode) -> str:
    s = re.sub(r"\D", "", str(pincode if pincode is not None else ""))
    if len(s) == 7 and s.startswith("0"):
        s = s[1:]
    return s


@lru_cache(maxsize=20000)
def _meta_cached(pin: str) -> tuple:
    if len(pin) >= 5 and pin[:5] in SPECIAL_AREAS:
        d = {"pincode_prefix": pin[:3], **SPECIAL_AREAS[pin[:5]], "source": "prefix"}
        return tuple(d.items())
    if len(pin) >= 3 and pin[0] != "0":
        r = _prefix_index().get(pin[:3])
        if r is not None:
            d = {k: r[k] for k in _META_KEYS}
            d["source"] = "prefix"
            return tuple(d.items())
    if len(pin) >= 3 and pin[0] != "0":
        r = _state_index().get(pin[:2])
        if r is not None:
            d = {k: r[k] for k in _META_KEYS}
            d["pincode_prefix"] = pin[:3] if len(pin) >= 3 else None
            d["source"] = "state"
            return tuple(d.items())
    d = dict(NATIONAL)
    d["pincode_prefix"] = pin[:3] if len(pin) >= 3 else None
    d["source"] = "national"
    return tuple(d.items())


def pincode_meta(pincode: str) -> dict:
    """Metadata + benchmark for a pincode. Never raises; falls back prefix -> state -> national."""
    try:
        d = dict(_meta_cached(_clean_pincode(pincode)))
    except Exception:  # pragma: no cover - defensive
        d = dict(NATIONAL)
        d["source"] = "national"
    # native python types
    d["tier"] = int(d["tier"])
    d["pseudo_count"] = int(d["pseudo_count"])
    for k in ("lat", "lng", "benchmark_rto_cod", "benchmark_rto_prepaid"):
        d[k] = float(d[k])
    return d


def get_benchmark(pincode: str, payment_method: str) -> float:
    """Benchmark RTO probability for this pincode and payment method."""
    m = pincode_meta(pincode)
    pm = str(payment_method or "").strip().upper()
    return m["benchmark_rto_prepaid"] if pm == "PREPAID" else m["benchmark_rto_cod"]


__all__ = ["load_pincode_benchmarks", "pincode_meta", "get_benchmark", "STATE_BY_2DIGIT", "NATIONAL"]
