"""End-to-end API tests (temp SQLite, no demo seeding).

Run from backend/:  .venv/Scripts/python -m pytest tests/test_api.py -q
"""
from __future__ import annotations

import io
import json
import math
import os
import tempfile
from pathlib import Path

import pytest

_TMP = Path(tempfile.mkdtemp(prefix="rto_test_"))
os.environ["RTO_DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["RTO_ARTIFACT_DIR"] = str(_TMP / "artifacts")
os.environ["RTO_SEED_DEMO"] = "false"
os.environ["RTO_SCHEDULER_ENABLED"] = "false"
os.environ["RTO_MESSAGING_PROVIDER"] = "mock"
os.environ.setdefault("DISABLE_SQLALCHEMY_CEXT_RUNTIME", "1")

from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import settings  # noqa: E402

settings.database_url = os.environ["RTO_DATABASE_URL"]
settings.artifact_dir = Path(os.environ["RTO_ARTIFACT_DIR"])
settings.seed_demo = False
settings.scheduler_enabled = False

from app.db.session import init_engine  # noqa: E402

init_engine(settings.database_url)

from app.main import app  # noqa: E402

ORDER = {
    "customer_id": "cust-test-1",
    "customer_phone": "9876543221",
    "customer_name": "Test Buyer",
    "pincode": "845401",
    "city": "Motihari",
    "state": "Bihar",
    "address": "near temple",
    "order_value": 3499,
    "payment_method": "COD",
    "product_category": "fashion",
    "quantity": 1,
    "channel": "website",
}


def _no_nan(obj):
    if isinstance(obj, float):
        assert math.isfinite(obj), "NaN/inf in response"
    elif isinstance(obj, dict):
        for v in obj.values():
            _no_nan(v)
    elif isinstance(obj, list):
        for v in obj:
            _no_nan(v)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def trained(client):
    r = client.post("/api/ingest/demo?n=3000&train=true")
    assert r.status_code == 200, r.text
    return r.json()


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "ok" and "model_version" in j and "orders" in j


def test_cold_start_score(client):
    r = client.post("/api/score?auto_action=false", json={**ORDER, "order_id": "COLD-1"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert 0 <= j["prediction"]["probability"] <= 1
    assert j["order"]["customer_phone"] == "98XXXXXX21"


def test_demo_ingest_and_train(trained):
    assert trained["rows_imported"] >= 2900
    assert trained["labelled_rows"] > 0
    tr = trained["train_report"]
    assert tr["metrics"]["roc_auc"] > 0.55
    _no_nan(trained)


def test_model_endpoints(client, trained):
    a = client.get("/api/model/active").json()
    assert a["cold_start"] is False and a["report"]["version"] == a["version"]
    v = client.get("/api/model/versions").json()
    assert any(x["is_active"] for x in v)
    assert client.post(f"/api/model/activate/{v[0]['version']}").json() == {"ok": True}
    assert client.post("/api/model/activate/nope").status_code == 404


def test_score_and_auto_action(client, trained):
    r = client.post("/api/score", json={**ORDER, "order_id": "T-1001"})
    assert r.status_code == 200, r.text
    j = r.json()
    _no_nan(j)
    assert set(j) >= {"order", "prediction", "recommendation", "action"}
    assert j["prediction"]["tier"] in ("low", "medium", "high")
    assert j["recommendation"]["action"] in (
        "NONE", "CONFIRM_WHATSAPP", "CONFIRM_SMS", "CONFIRM_CALL", "PREPAID_NUDGE", "ADDRESS_VERIFY",
        "MANUAL_REVIEW", "HOLDOUT_CONTROL")
    assert isinstance(j["recommendation"]["alternatives"], list)
    assert j["order"]["id"] > 0


def test_bad_score_input(client):
    r = client.post("/api/score", json={**ORDER, "pincode": "12"})
    assert r.status_code == 422


def test_what_if(client, trained):
    r = client.post("/api/score/what-if", json={"order": ORDER, "changes": {"payment_method": "PREPAID"}})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["new"]["probability"] < j["base"]["probability"]
    assert j["delta"] < 0


def test_orders_list_and_detail(client, trained):
    r = client.get("/api/orders?historical=false&page_size=10")
    assert r.status_code == 200
    j = r.json()
    assert j["total"] >= 1 and j["items"][0]["prediction"] is not None
    r = client.get("/api/orders?historical=true&tier=&page=2&page_size=5&sort=-date&payment_method=COD")
    assert r.status_code == 200 and len(r.json()["items"]) == 5
    oid = j["items"][0]["id"]
    d = client.get(f"/api/orders/{oid}").json()
    assert d["order"]["id"] == oid and d["predictions"] and d["timeline"]
    assert client.get("/api/orders/999999").status_code == 404


def test_queue_decision(client, trained):
    # make sure there is at least one high-risk live order
    for i in range(15):
        client.post("/api/score?auto_action=false", json={**ORDER, "order_id": f"Q-{i}", "order_value": 4999})
    q = client.get("/api/queue").json()
    assert "counts" in q
    assert q["items"], "expected flagged orders in queue"
    oid = q["items"][0]["id"]
    r = client.post(f"/api/queue/{oid}/decision", json={"decision": "send_confirmation"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "AWAITING_CUSTOMER"
    r = client.post(f"/api/queue/{oid}/decision", json={"decision": "approve", "note": "looks fine"})
    assert r.json()["status"] == "APPROVED"


def test_public_confirm_flow(client, trained):
    r = client.post("/api/score?auto_action=false", json={**ORDER, "order_id": "PUB-1"})
    oid = r.json()["order"]["id"]
    a = client.post(f"/api/orders/{oid}/actions", json={"type": "PREPAID_NUDGE"}).json()
    assert a["status"] == "SENT" and a["token"]
    v = client.get(f"/api/public/confirm/{a['token']}").json()
    assert v["kind"] == "prepaid_nudge" and "convert_prepaid" in v["options"] and not v["already_responded"]
    r = client.post(f"/api/public/confirm/{a['token']}", json={"response": "convert_prepaid"}).json()
    assert r["ok"] and r.get("payment_link")
    again = client.get(f"/api/public/confirm/{a['token']}").json()
    assert again["already_responded"] is True
    o = client.get(f"/api/orders/{oid}").json()["order"]
    assert o["status"] == "CONVERTED_PREPAID" and o["payment_method"] == "PREPAID"
    assert client.get("/api/public/confirm/bogus").status_code == 404
    # outcome
    r = client.post(f"/api/orders/{oid}/outcome", json={"outcome": "DELIVERED"})
    assert r.json()["outcome"] == "DELIVERED"


def test_dashboard(client, trained):
    s = client.get("/api/dashboard/summary").json()
    _no_nan(s)
    assert s["orders_analyzed"] > 0 and 0 < s["historical_rto_rate"] < 1
    assert s["est_savings_label"]
    t = client.get("/api/dashboard/trend?granularity=month").json()
    assert t and {"period", "orders", "rto_rate"} <= set(t[0])
    for by in ("pincode", "category", "state", "city"):
        tr = client.get(f"/api/dashboard/top-risk?by={by}&limit=5").json()
        assert len(tr) <= 5 and all("smoothed_rate" in x for x in tr)
    h = client.get("/api/dashboard/heatmap").json()
    assert h and "lat" in h[0]


def test_impact_report(client, trained):
    from app.services.seed import run_pilot

    run_pilot(settings.default_seller_id, 300, 20)
    r = client.get("/api/impact/report")
    assert r.status_code == 200
    j = r.json()
    _no_nan(j)
    assert j["label"].startswith("Estimated")
    assert j["experiment"]["treatment"]["n"] > 0
    assert set(j["costs"]) >= {"per_rto_cost", "rto_avoided", "gross_saved", "intervention_cost", "net_saved", "roi"}
    c = client.get("/api/impact/report.csv")
    assert c.status_code == 200 and "text/csv" in c.headers["content-type"]


def test_drift_and_fairness(client, trained):
    d = client.get("/api/model/drift")
    assert d.status_code == 200, d.text
    assert "overall_psi" in d.json()
    f = client.get("/api/model/fairness")
    assert f.status_code == 200, f.text
    assert f.json()["status"] in ("pass", "warn", "fail")


def test_settings_update(client):
    s = client.get("/api/settings").json()
    assert s["thresholds"]["medium"] == 0.18
    r = client.put("/api/settings", json={"store_name": "Kurta Co", "thresholds": {"high": 0.4}, "holdout_pct": 0.2})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["store_name"] == "Kurta Co" and j["thresholds"]["high"] == 0.4 and j["thresholds"]["medium"] == 0.18
    bad = client.put("/api/settings", json={"thresholds": {"medium": 0.9}})
    assert bad.status_code == 422


def test_csv_ingest(client):
    csv = ("order_id,order_date,customer_id,pincode,order_value,payment_method,product_category,quantity,channel,outcome\n"
           "CSV-1,2026-01-05 10:00,c1,560001,999,COD,fashion,1,website,DELIVERED\n"
           "CSV-2,2026-01-06 23:10,c2,845401,2499,COD,footwear,1,website,RTO\n")
    r = client.post("/api/ingest/csv", files={"file": ("orders.csv", io.BytesIO(csv.encode()), "text/csv")})
    assert r.status_code == 200, r.text
    assert r.json()["rows_imported"] == 2
    bad = client.post("/api/ingest/csv", files={"file": ("x.csv", io.BytesIO(b""), "text/csv")})
    assert bad.status_code == 422


def test_batch_score(client, trained):
    csv = ("order_id,order_date,customer_id,pincode,order_value,payment_method,product_category,quantity,channel\n"
           "B-1,2026-11-20 01:30,cb1,845401,2999,COD,fashion,1,website\n"
           "B-2,2026-11-20 12:00,cb2,560001,499,PREPAID,beauty,1,website\n")
    r = client.post("/api/score/batch", files={"file": ("b.csv", io.BytesIO(csv.encode()), "text/csv")})
    assert r.status_code == 200, r.text
    j = r.json()
    assert len(j["items"]) == 2 and sum(j["summary"].values()) == 2


def test_webhook_shopify(client, trained):
    payload = {
        "id": 555001, "name": "#1555", "created_at": "2026-11-20T10:00:00+05:30", "total_price": "1899.00",
        "gateway": "Cash on Delivery (COD)", "payment_gateway_names": ["Cash on Delivery (COD)"],
        "financial_status": "pending",
        "customer": {"id": 77, "first_name": "Asha", "last_name": "K", "phone": "+919812345678"},
        "shipping_address": {"address1": "12 MG Road", "city": "Bengaluru", "province": "Karnataka", "zip": "560001",
                             "phone": "+919812345678", "name": "Asha K"},
        "line_items": [{"title": "Cotton Kurta", "sku": "KUR-1", "quantity": 1, "price": "1899.00"}],
    }
    r = client.post("/api/webhooks/shopify/orders-create", content=json.dumps(payload),
                    headers={"Content-Type": "application/json"})
    assert r.status_code == 200, r.text
    assert r.json()["order"]["pincode"] == "560001"


def test_simulator_status(client):
    j = client.get("/api/simulate/status").json()
    assert set(j) >= {"running", "rate_per_min", "generated"}
