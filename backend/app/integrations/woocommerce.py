"""WooCommerce REST v3 order sync + webhook helpers."""
from __future__ import annotations

import base64
import hashlib
import hmac
from datetime import datetime

import pandas as pd

from app.integrations import IntegrationError
from app.integrations.csv_mapper import (CANONICAL_COLUMNS, clean_pincode, infer_category, map_outcome,
                                         map_payment, normalize_phone, parse_dates)

_PER_PAGE = 100
_MAX_PAGES = 200


def _base_url(store_url: str) -> str:
    s = (store_url or "").strip().rstrip("/")
    if not s:
        raise IntegrationError("WooCommerce store URL is required")
    if not s.startswith("http"):
        s = "https://" + s
    for suffix in ("/wp-json/wc/v3", "/wp-json"):
        if s.endswith(suffix):
            s = s[: -len(suffix)]
    return s


def _outcome(o: dict) -> str | None:
    st = str(o.get("status") or "").lower()
    if any(k in st for k in ("rto", "return", "undeliver")):
        return "RTO"
    for m in o.get("meta_data") or []:
        k = str(m.get("key") or "").lower()
        if any(x in k for x in ("delivery_status", "shipment_status", "rto", "courier_status")):
            oc = map_outcome(m.get("value"))
            if oc:
                return oc
    if st == "completed":
        return "DELIVERED"
    return None


def _order_to_canonical(o: dict) -> dict:
    ship = o.get("shipping") or {}
    bill = o.get("billing") or {}
    addr_src = ship if (ship.get("postcode") or ship.get("address_1")) else bill
    items = o.get("line_items") or []
    first = items[0] if items else {}
    name = " ".join(x for x in (addr_src.get("first_name"), addr_src.get("last_name")) if x) or None
    phone = normalize_phone(ship.get("phone") or bill.get("phone"))
    created = o.get("date_created") or o.get("date_created_gmt")
    dt = parse_dates(pd.Series([created])).iloc[0] if created else pd.NaT
    if pd.isna(dt):
        dt = pd.Timestamp.now().floor("s")
    cid = o.get("customer_id")
    if not cid:
        key = phone or bill.get("email") or f"{name}|{addr_src.get('postcode')}"
        cid = "C-" + hashlib.sha1(str(key).lower().encode()).hexdigest()[:10]
    cat = "Other"
    for it in items:
        c = infer_category(it.get("name"))
        if c != "Other":
            cat = c
            break
    pm = map_payment(o.get("payment_method") or o.get("payment_method_title"))
    if pm is None:
        pm = "PREPAID" if o.get("date_paid") else "COD"
    try:
        value = float(o.get("total") or 0)
    except (TypeError, ValueError):
        value = 0.0
    addr = ", ".join(x for x in (addr_src.get("address_1"), addr_src.get("address_2")) if x) or None
    return {
        "order_id": str(o.get("number") or o.get("id")),
        "order_date": pd.Timestamp(dt).to_pydatetime(),
        "customer_id": str(cid),
        "customer_phone": phone,
        "customer_name": name,
        "pincode": clean_pincode(addr_src.get("postcode")) or str(addr_src.get("postcode") or ""),
        "city": addr_src.get("city"),
        "state": addr_src.get("state"),
        "address": addr,
        "order_value": value,
        "payment_method": pm,
        "product_category": cat,
        "sku": first.get("sku") or None,
        "quantity": int(sum(int(it.get("quantity") or 0) for it in items) or 1),
        "channel": "woocommerce",
        "outcome": None,
    }


def normalize_webhook(payload: dict) -> dict:
    """WooCommerce ``order.created`` webhook payload -> canonical order dict (outcome None)."""
    if not isinstance(payload, dict):
        raise IntegrationError("WooCommerce webhook payload must be a JSON object")
    try:
        d = _order_to_canonical(payload)
    except Exception as e:
        raise IntegrationError(f"Could not parse WooCommerce order payload: {e}") from e
    d["outcome"] = None
    return d


def verify_webhook(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify ``X-WC-Webhook-Signature`` (base64 HMAC-SHA256 of raw body). True if no secret (dev)."""
    if not secret:
        return True
    if not signature_header:
        return False
    digest = base64.b64encode(hmac.new(secret.encode(), raw_body or b"", hashlib.sha256).digest()).decode()
    return hmac.compare_digest(digest, signature_header.strip())


async def fetch_orders(store_url: str, access_token: str, since: datetime | None = None,
                       consumer_secret: str | None = None) -> pd.DataFrame:
    """Fetch orders via ``/wp-json/wc/v3/orders`` (``access_token`` = consumer key) -> canonical df."""
    import httpx

    if not access_token or not consumer_secret:
        raise IntegrationError("WooCommerce consumer key and consumer secret are required")
    url = f"{_base_url(store_url)}/wp-json/wc/v3/orders"
    params = {"per_page": _PER_PAGE, "page": 1, "orderby": "date", "order": "asc"}
    if since:
        params["after"] = since.replace(microsecond=0).isoformat()
    rows: list[dict] = []
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True,
                                     auth=(access_token, consumer_secret)) as client:
            for page in range(1, _MAX_PAGES + 1):
                params["page"] = page
                r = await client.get(url, params=params)
                if r.status_code in (401, 403):
                    raise IntegrationError(f"WooCommerce rejected the API keys ({r.status_code})")
                if r.status_code == 404:
                    raise IntegrationError("WooCommerce REST API not found (check store URL / permalinks)")
                if r.status_code >= 400:
                    raise IntegrationError(f"WooCommerce API error {r.status_code}: {r.text[:200]}")
                data = r.json()
                if not isinstance(data, list):
                    raise IntegrationError("Unexpected WooCommerce response (expected a list of orders)")
                for o in data:
                    try:
                        if str(o.get("status")) in ("cancelled", "failed", "pending", "checkout-draft") \
                                and _outcome(o) is None:
                            continue
                        d = _order_to_canonical(o)
                        d["outcome"] = _outcome(o)
                        rows.append(d)
                    except Exception:
                        continue
                total_pages = int(r.headers.get("x-wp-totalpages") or 0)
                if len(data) < _PER_PAGE or (total_pages and page >= total_pages):
                    break
    except IntegrationError:
        raise
    except httpx.HTTPError as e:
        raise IntegrationError(f"Could not reach WooCommerce: {e}") from e
    except ValueError as e:
        raise IntegrationError(f"Invalid response from WooCommerce: {e}") from e
    df = pd.DataFrame(rows, columns=CANONICAL_COLUMNS)
    if len(df):
        df = df[df["pincode"].str.fullmatch(r"\d{6}", na=False)]
        df["order_date"] = pd.to_datetime(df["order_date"])
        df = df.drop_duplicates("order_id").sort_values("order_date").reset_index(drop=True)
    return df


__all__ = ["fetch_orders", "normalize_webhook", "verify_webhook"]
