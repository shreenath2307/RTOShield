import asyncio
import base64
import hashlib
import hmac
import json
import time
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.data.benchmarks import get_benchmark, load_pincode_benchmarks, pincode_meta
from app.data.synthetic import generate_live_order, generate_orders
from app.integrations import IntegrationError
from app.integrations import messaging, shopify, woocommerce
from app.integrations.csv_mapper import (CANONICAL_COLUMNS, detect_and_map, map_outcome, map_payment,
                                         read_any)

SAMPLES = Path(__file__).resolve().parents[1] / "sample_data"

ALL_STATES_UTS = {
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
    "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
    "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
    "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry",
}


# ---------------- benchmarks ----------------
def test_benchmark_table_coverage():
    bm = load_pincode_benchmarks()
    assert len(bm) >= 150
    assert bm["pincode_prefix"].is_unique
    assert bm["pincode_prefix"].str.fullmatch(r"\d{3}").all()
    assert ALL_STATES_UTS <= set(bm["state"])
    assert set(bm["region"]) <= {"North", "South", "East", "West", "Central", "NorthEast"}
    assert set(bm["tier"]) == {1, 2, 3}
    assert set(bm["income_band"]) <= {"low", "mid", "high"}
    assert (bm["benchmark_rto_prepaid"] < bm["benchmark_rto_cod"]).all()
    assert bm.groupby("tier")["benchmark_rto_cod"].mean().is_monotonic_increasing
    assert load_pincode_benchmarks() is load_pincode_benchmarks()  # cached


def test_pincode_meta_fallbacks():
    m = pincode_meta("110017")
    assert m["source"] == "prefix" and m["state"] == "Delhi" and m["tier"] == 1
    keys = {"pincode_prefix", "state", "city", "region", "tier", "lat", "lng", "income_band",
            "benchmark_rto_cod", "benchmark_rto_prepaid", "pseudo_count", "source"}
    assert keys <= set(m)
    assert pincode_meta("682555")["state"] == "Lakshadweep"
    assert pincode_meta("396230")["state"].startswith("Dadra")
    s = pincode_meta("189999")  # 189 not in table -> J&K circle
    assert s["source"] == "state" and s["state"] == "Jammu and Kashmir"
    for bad in ("999999", "", None, "abc", "000000", 12):
        assert pincode_meta(bad)["source"] == "national"
    assert get_benchmark("560001", "PREPAID") < get_benchmark("560001", "COD")
    assert get_benchmark("781001", "COD") > get_benchmark("400001", "COD")


# ---------------- synthetic ----------------
def test_generate_orders_rates_and_schema():
    t = time.time()
    df = generate_orders(8000, seed=42)
    assert time.time() - t < 2.0
    assert list(df.columns) == CANONICAL_COLUMNS
    assert len(df) == 8000 and df["order_id"].is_unique
    assert df["pincode"].str.fullmatch(r"[1-9]\d{5}").all()
    rto = df["outcome"] == "RTO"
    cod = df["payment_method"] == "COD"
    assert 0.20 <= rto[cod].mean() <= 0.35
    assert rto[~cod].mean() < 0.10
    tiers = df["pincode"].map(lambda p: pincode_meta(p)["tier"])
    assert rto[cod & (tiers == 3)].mean() > rto[cod & (tiers == 1)].mean()
    night = df["order_date"].dt.hour < 5
    assert rto[night].mean() > rto[~night].mean()
    assert df["customer_id"].duplicated(keep=False).mean() > 0.15  # repeat customers
    assert set(df["outcome"]) == {"RTO", "DELIVERED"}


def test_generate_orders_deterministic_and_unlabelled():
    a = generate_orders(500, seed=3)
    b = generate_orders(500, seed=3)
    pd.testing.assert_frame_equal(a, b)
    c = generate_orders(100, seed=3, with_outcome=False)
    assert c["outcome"].isna().all()


def test_generate_live_order():
    now = datetime(2026, 11, 20, 1, 30)
    o = generate_live_order(np.random.default_rng(1), now=now)
    assert set(o) == set(CANONICAL_COLUMNS)
    assert o["outcome"] is None and o["order_date"] == now
    assert len(o["pincode"]) == 6 and o["payment_method"] in ("COD", "PREPAID")
    assert generate_live_order()["order_id"] != generate_live_order()["order_id"]


# ---------------- csv mapper ----------------
@pytest.mark.parametrize("fname,fmt,min_rows,labelled", [
    ("shopify_orders_sample.csv", "shopify", 280, True),
    ("woocommerce_orders_sample.csv", "woocommerce", 280, True),
    ("canonical_orders_sample.csv", "canonical", 1900, True),
    ("new_orders_to_score.csv", "canonical", 50, False),
])
def test_mapper_on_samples(fname, fmt, min_rows, labelled):
    res = detect_and_map(read_any(SAMPLES / fname))
    assert res.source_format == fmt
    assert list(res.df.columns) == CANONICAL_COLUMNS
    assert len(res.df) >= min_rows
    rep = res.report
    for k in ("rows_in", "rows_out", "dropped", "dropped_count", "warnings", "missing_by_column",
              "outcome_distribution", "date_range"):
        assert k in rep
    assert rep["rows_out"] == len(res.df)
    assert res.df["pincode"].str.fullmatch(r"\d{6}").all()
    assert set(res.df["payment_method"]) <= {"COD", "PREPAID"}
    assert res.df["order_id"].is_unique
    if labelled:
        assert rep["outcome_distribution"]["RTO"] > 0 and rep["outcome_distribution"]["DELIVERED"] > 0
    else:
        assert rep["outcome_distribution"]["unknown"] == len(res.df)
    if fmt in ("shopify", "woocommerce"):
        assert rep["dropped_count"] >= 1  # junk rows dropped, not crashed
        assert (res.df["channel"] == fmt).all()


def test_mapper_shopify_line_items_aggregated():
    res = detect_and_map(read_any(SAMPLES / "shopify_orders_sample.csv"))
    assert any("Aggregated" in w for w in res.report["warnings"])
    assert res.df["product_category"].isin(["Fashion", "Footwear", "Electronics", "Beauty", "Home & Kitchen",
                                            "Grocery", "Accessories", "Health"]).mean() > 0.95


def test_mapper_shiprocket_and_fuzzy():
    ship = pd.DataFrame({
        "Order ID": ["A1", "A2", "A3"], "Shiprocket Created At": ["05 Oct 2025, 10:15 AM", "06 Oct 2025, 11:00 PM", "x"],
        "Payment Method": ["cod", "prepaid", "COD"], "Customer Pincode": ["110001", "560 034", "400001"],
        "Status": ["RTO DELIVERED", "DELIVERED", "IN TRANSIT"], "Order Total": ["1,299", "₹ 899.00", "500"],
        "Product Name": ["Cotton Kurta", "Bluetooth Speaker", "Ghee"], "Customer Name": ["A B", "C D", "E F"],
        "Customer Mobile": ["+91 98765 43210", "9876501234", "123"],
    })
    r = detect_and_map(ship)
    assert r.source_format == "shiprocket"
    assert r.df["outcome"].tolist() == ["RTO", "DELIVERED"]
    assert r.df["pincode"].tolist() == ["110001", "560034"]
    assert r.df["product_category"].tolist() == ["Fashion", "Electronics"]
    assert r.report["dropped_count"] == 1

    messy = pd.DataFrame({
        "Order No.": [1, 2, 2], "Date": ["2025-10-01", "2025-10-02", "2025-10-02"],
        "PIN Code": [226010, 800001, 800001], "Amount (Rs)": [999, 1500, 1500],
        "Mode of Payment": ["Cash on Delivery", "UPI", "UPI"], "Delivery Status": ["Returned", "Delivered", "Delivered"],
        "Item": ["Running Shoes", "Face Serum", "Face Serum"],
    })
    r = detect_and_map(messy)
    assert r.source_format == "unknown"
    assert len(r.df) == 2 and r.df["outcome"].tolist() == ["RTO", "DELIVERED"]
    assert r.df["payment_method"].tolist() == ["COD", "PREPAID"]
    assert r.column_map["PIN Code"] == "pincode"


def test_mapper_never_crashes():
    r = detect_and_map(pd.DataFrame({"foo": [1, None], "bar": ["x", "y"]}))
    assert r.report["rows_out"] == 0 and r.report["dropped_count"] == 2
    r = detect_and_map(pd.DataFrame())
    assert r.df.empty


def test_status_and_payment_mapping():
    assert map_outcome("RTO Delivered") == "RTO"
    assert map_outcome("Returned to origin") == "RTO"
    assert map_outcome("cancelled after shipping") == "RTO"
    assert map_outcome("Delivered") == "DELIVERED"
    assert map_outcome("Completed") == "DELIVERED"
    assert map_outcome("In Transit") is None
    assert map_payment("Cash on Delivery (COD)") == "COD"
    assert map_payment("cod") == "COD"
    assert map_payment("Razorpay") == "PREPAID"
    assert map_payment("Prepaid") == "PREPAID"


# ---------------- webhooks ----------------
def _sig(secret, body):
    return base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()


@pytest.mark.parametrize("mod", [shopify, woocommerce])
def test_verify_webhook(mod):
    body = json.dumps({"id": 1}).encode()
    assert mod.verify_webhook(body, _sig("s3cret", body), "s3cret")
    assert not mod.verify_webhook(body, _sig("other", body), "s3cret")
    assert not mod.verify_webhook(body, None, "s3cret")
    assert mod.verify_webhook(body, None, None)
    assert mod.verify_webhook(body, "garbage", "")


def test_normalize_webhooks():
    sp = {"id": 1, "name": "#1050", "created_at": "2026-11-20T01:42:00+05:30", "total_price": "1499.00",
          "financial_status": "pending", "payment_gateway_names": ["Cash on Delivery (COD)"],
          "email": "a@b.com", "tags": "",
          "shipping_address": {"name": "Ravi Kumar", "address1": "12 MG Road", "city": "Patna",
                               "province": "Bihar", "zip": "800001", "phone": "+91 98765 43210"},
          "line_items": [{"title": "Cotton Kurta", "sku": "FSH-1", "quantity": 2}]}
    o = shopify.normalize_webhook(sp)
    assert o["order_id"] == "#1050" and o["pincode"] == "800001" and o["payment_method"] == "COD"
    assert o["order_date"] == datetime(2026, 11, 20, 1, 42) and o["quantity"] == 2
    assert o["product_category"] == "Fashion" and o["channel"] == "shopify" and o["outcome"] is None
    assert o["customer_phone"] == "9876543210"

    wc = {"id": 77, "number": "77", "status": "processing", "date_created": "2026-11-20T10:00:00",
          "total": "899.00", "payment_method": "razorpay", "payment_method_title": "Razorpay",
          "billing": {"first_name": "Asha", "last_name": "Nair", "phone": "9876500000", "email": "x@y.in",
                      "postcode": "682001"},
          "shipping": {"first_name": "Asha", "last_name": "Nair", "address_1": "Flat 2", "city": "Kochi",
                       "state": "KL", "postcode": "682001"},
          "line_items": [{"name": "Vitamin C Serum", "sku": "BTY-9", "quantity": 1}], "customer_id": 0}
    o = woocommerce.normalize_webhook(wc)
    assert o["payment_method"] == "PREPAID" and o["pincode"] == "682001" and o["product_category"] == "Beauty"
    assert set(o) == set(CANONICAL_COLUMNS)
    with pytest.raises(IntegrationError):
        shopify.normalize_webhook("nope")


def test_fetch_orders_errors_cleanly():
    with pytest.raises(IntegrationError):
        asyncio.run(shopify.fetch_orders("", "tok"))
    with pytest.raises(IntegrationError):
        asyncio.run(woocommerce.fetch_orders("https://example.invalid", "ck", None))
    with pytest.raises(IntegrationError):
        asyncio.run(shopify.fetch_orders("https://nonexistent-store-xyz.invalid", "tok"))


# ---------------- messaging ----------------
def test_render_templates():
    order = {"order_id": "SO1", "customer_name": "Priya Sharma", "order_value": 1499, "pincode": "226010"}
    for kind in ("confirm", "prepaid_nudge", "address_verify"):
        for lang in ("en", "hi"):
            txt = messaging.render_template(kind, order, "http://x/c/abc", "Kurta Co", lang)
            assert "http://x/c/abc" in txt and "Kurta Co" in txt and "Priya" in txt
            assert len(txt) < 400
    assert "₹30" in messaging.render_template("prepaid_nudge", order, "L", "S")
    assert "₹1,469" in messaging.render_template("prepaid_nudge", order, "L", "S")
    assert "226010" in messaging.render_template("address_verify", order, "L", "S", "hi")
    assert "नमस्ते" in messaging.render_template("confirm", order, "L", "S", "hi")


def test_phone_and_mock_provider():
    assert messaging.to_e164("98765 43210") == "+919876543210"
    assert messaging.to_e164("+91-98765-43210") == "+919876543210"
    assert messaging.to_e164("09876543210") == "+919876543210"
    assert messaging.to_e164("12345") is None
    p = messaging.get_provider("mock")
    r = asyncio.run(p.send("9876543210", "whatsapp", "hello"))
    assert r.ok and r.provider == "mock" and r.message_id
    assert p.sent[-1]["to"] == "+919876543210"
    t = messaging.TwilioProvider(sid=None, token=None, from_=None)
    t.sid = t.token = t.from_ = None
    r = asyncio.run(t.send("9876543210", "sms", "x"))
    assert not r.ok and r.error
