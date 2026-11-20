"""Shopify Admin REST (2024-10) order sync + webhook helpers."""
from __future__ import annotations

import base64
import hashlib
import hmac
import re
from datetime import datetime

import pandas as pd

from app.integrations import IntegrationError
from app.integrations.csv_mapper import (CANONICAL_COLUMNS, clean_pincode, infer_category, map_outcome,
                                         map_payment, normalize_phone, parse_dates)

API_VERSION = "2024-10"
_MAX_PAGES = 200


def _base_url(store_url: str) -> str:
    s = (store_url or "").strip().rstrip("/")
    if not s:
        raise IntegrationError("Shopify store URL is required")
    if not s.startswith("http"):
        s = "https://" + s
    s = re.sub(r"/admin.*$", "", s)
    if "." not in s.split("//", 1)[1]:
        s = s + ".myshopify.com"
    return s


def _next_link(link_header: str | None) -> str | None:
    if not link_header:
        return None
    for part in link_header.split(","):
        m = re.search(r'<([^>]+)>\s*;\s*rel="?next"?', part)
        if m:
            return m.group(1)
    return None


def _outcome(o: dict) -> str | None:
    tags = [t.strip().lower() for t in str(o.get("tags") or "").split(",") if t.strip()]
    if any(t.startswith("rto") or t in ("returned", "return to origin", "undelivered") for t in tags):
        return "RTO"
    statuses = [str(f.get("shipment_status") or "").lower() for f in (o.get("fulfillments") or [])]
    if any(s == "failure" for s in statuses):
        return "RTO"
    if "delivered" in tags or any(s == "delivered" for s in statuses):
        return "DELIVERED"
    # sometimes 3PL apps write status into note_attributes
    for na in o.get("note_attributes") or []:
        if str(na.get("name", "")).lower() in ("delivery status", "shipment status", "rto status"):
            oc = map_outcome(na.get("value"))
            if oc:
                return oc
    return None


def _payment(o: dict) -> str:
    gw = " ".join(o.get("payment_gateway_names") or []) or str(o.get("gateway") or "")
    pm = map_payment(gw)
    if pm:
        return pm
    fs = str(o.get("financial_status") or "").lower()
    return "PREPAID" if fs in ("paid", "partially_refunded", "refunded", "authorized") else "COD"


def _order_to_canonical(o: dict) -> dict:
    ship = o.get("shipping_address") or o.get("billing_address") or {}
    cust = o.get("customer") or {}
    items = o.get("line_items") or []
    first = items[0] if items else {}
    name = ship.get("name") or " ".join(x for x in (cust.get("first_name"), cust.get("last_name")) if x) or None
    phone = normalize_phone(ship.get("phone") or o.get("phone") or cust.get("phone")
                            or (o.get("billing_address") or {}).get("phone"))
    created = o.get("created_at") or o.get("processed_at")
    dt = parse_dates(pd.Series([created])).iloc[0] if created else pd.NaT
    if pd.isna(dt):
        dt = pd.Timestamp.now().floor("s")
    addr = ", ".join(x for x in (ship.get("address1"), ship.get("address2")) if x) or None
    cid = cust.get("id")
    if not cid:
        key = phone or o.get("email") or o.get("contact_email") or f"{name}|{ship.get('zip')}"
        cid = "C-" + hashlib.sha1(str(key).lower().encode()).hexdigest()[:10]
    cat = None
    for it in items:
        c = infer_category(it.get("title") or it.get("name"))
        if c != "Other":
            cat = c
            break
    try:
        value = float(o.get("total_price") or o.get("current_total_price") or 0)
    except (TypeError, ValueError):
        value = 0.0
    return {
        "order_id": str(o.get("name") or o.get("order_number") or o.get("id")),
        "order_date": pd.Timestamp(dt).to_pydatetime(),
        "customer_id": str(cid),
        "customer_phone": phone,
        "customer_name": name,
        "pincode": clean_pincode(ship.get("zip")) or str(ship.get("zip") or ""),
        "city": ship.get("city"),
        "state": ship.get("province"),
        "address": addr,
        "order_value": value,
        "payment_method": _payment(o),
        "product_category": cat or (first.get("product_type") if first else None) or "Other",
        "sku": first.get("sku") or None,
        "quantity": int(sum(int(it.get("quantity") or 0) for it in items) or 1),
        "channel": "shopify",
        "outcome": None,
    }


def normalize_webhook(payload: dict) -> dict:
    """Shopify ``orders/create`` webhook payload -> canonical order dict (outcome None)."""
    if not isinstance(payload, dict):
        raise IntegrationError("Shopify webhook payload must be a JSON object")
    try:
        d = _order_to_canonical(payload)
    except IntegrationError:
        raise
    except Exception as e:
        raise IntegrationError(f"Could not parse Shopify order payload: {e}") from e
    d["outcome"] = None
    return d


def verify_webhook(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify ``X-Shopify-Hmac-Sha256`` (base64 HMAC-SHA256 of raw body). True if no secret (dev)."""
    if not secret:
        return True
    if not signature_header:
        return False
    digest = base64.b64encode(hmac.new(secret.encode(), raw_body or b"", hashlib.sha256).digest()).decode()
    return hmac.compare_digest(digest, signature_header.strip())


async def fetch_orders(store_url: str, access_token: str, since: datetime | None = None,
                       consumer_secret: str | None = None) -> pd.DataFrame:
    """Fetch all orders (status=any) via Admin REST with Link-header pagination -> canonical df."""
    import httpx

    if not access_token:
        raise IntegrationError("Shopify access token is required")
    base = _base_url(store_url)
    url: str | None = f"{base}/admin/api/{API_VERSION}/orders.json"
    params: dict | None = {"status": "any", "limit": 250}
    if since:
        params["created_at_min"] = since.isoformat()
    headers = {"X-Shopify-Access-Token": access_token, "Accept": "application/json"}
    rows: list[dict] = []
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            for _ in range(_MAX_PAGES):
                if url is None:
                    break
                r = await client.get(url, headers=headers, params=params)
                if r.status_code == 401 or r.status_code == 403:
                    raise IntegrationError(f"Shopify rejected the access token ({r.status_code})")
                if r.status_code == 404:
                    raise IntegrationError("Shopify store not found (check store URL)")
                if r.status_code >= 400:
                    raise IntegrationError(f"Shopify API error {r.status_code}: {r.text[:200]}")
                data = r.json()
                for o in data.get("orders", []):
                    try:
                        d = _order_to_canonical(o)
                        d["outcome"] = _outcome(o)
                        if o.get("cancelled_at") and d["outcome"] is None:
                            continue  # cancelled before shipping: not a delivery outcome
                        rows.append(d)
                    except Exception:
                        continue
                url = _next_link(r.headers.get("link"))
                params = None  # next-page URL carries page_info
    except IntegrationError:
        raise
    except httpx.HTTPError as e:
        raise IntegrationError(f"Could not reach Shopify: {e}") from e
    except ValueError as e:
        raise IntegrationError(f"Invalid response from Shopify: {e}") from e
    df = pd.DataFrame(rows, columns=CANONICAL_COLUMNS)
    if len(df):
        df = df[df["pincode"].str.fullmatch(r"\d{6}", na=False)]
        df["order_date"] = pd.to_datetime(df["order_date"])
        df = df.drop_duplicates("order_id").sort_values("order_date").reset_index(drop=True)
    return df


__all__ = ["fetch_orders", "normalize_webhook", "verify_webhook", "API_VERSION"]
