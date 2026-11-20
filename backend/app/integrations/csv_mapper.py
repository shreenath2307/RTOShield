"""Map arbitrary order exports (Shopify, WooCommerce, Shiprocket, canonical, unknown) to the
canonical order schema, with a data-quality report. Never crashes on bad rows: they are
dropped with a reason."""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

CANONICAL_COLUMNS: list[str] = [
    "order_id", "order_date", "customer_id", "customer_phone", "customer_name",
    "pincode", "city", "state", "address", "order_value", "payment_method",
    "product_category", "sku", "quantity", "channel", "outcome",
]

VALID_CHANNELS = {"shopify", "woocommerce", "whatsapp", "instagram", "website", "manual"}


@dataclass
class MappingResult:
    df: pd.DataFrame
    source_format: str
    column_map: dict[str, str] = field(default_factory=dict)
    report: dict = field(default_factory=dict)


def _norm(h) -> str:
    s = str(h).replace("﻿", "").strip().lower()
    s = s.replace("&", " and ").replace("#", " number ")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


# --------------------------------------------------------------------------------------
# Header dictionaries (normalised header -> internal field). Internal fields extend the
# canonical set with helpers: status, tags, financial_status, item_name, first_name,
# last_name, email, address2, discount.
# --------------------------------------------------------------------------------------
SHOPIFY_MAP = {
    "name": "order_id", "created at": "order_date", "total": "order_value",
    "financial status": "financial_status", "payment method": "payment_method",
    "shipping zip": "pincode", "shipping city": "city", "shipping province": "state",
    "shipping province name": "state", "shipping address1": "address", "shipping address2": "address2",
    "shipping street": "address_alt", "lineitem name": "item_name", "lineitem sku": "sku",
    "lineitem quantity": "quantity", "email": "email", "phone": "customer_phone",
    "shipping phone": "shipping_phone", "billing phone": "billing_phone",
    "shipping name": "customer_name", "billing name": "billing_name", "tags": "tags",
    "fulfillment status": "fulfillment_status", "notes": "notes", "source": "source_channel",
    "id": "shopify_id", "cancelled at": "cancelled_at", "billing zip": "billing_zip",
    "delivery status": "status", "shipment status": "status", "product type": "product_category",
}
WOO_MAP = {
    "order number": "order_id", "order id": "order_id", "order date": "order_date",
    "order total amount": "order_value", "order total": "order_value",
    "payment method title": "payment_method", "payment method": "payment_method_code",
    "shipping postcode": "pincode", "postcode shipping": "pincode", "billing postcode": "billing_zip",
    "postcode billing": "billing_zip", "shipping city": "city", "city shipping": "city",
    "shipping state": "state", "state code shipping": "state", "state name shipping": "state",
    "shipping address 1": "address", "address 1 shipping": "address", "shipping address 2": "address2",
    "address 1 and 2 shipping": "address", "order status": "status", "status": "status",
    "first name shipping": "first_name", "last name shipping": "last_name",
    "shipping first name": "first_name", "shipping last name": "last_name",
    "first name billing": "bfirst_name", "last name billing": "blast_name",
    "billing first name": "bfirst_name", "billing last name": "blast_name",
    "customer name": "customer_name", "phone billing": "customer_phone", "billing phone": "customer_phone",
    "shipping phone": "shipping_phone", "email billing": "email", "billing email": "email",
    "customer user id": "customer_id", "customer id": "customer_id",
    "item name": "item_name", "product name": "item_name", "quantity": "quantity",
    "quantity minus refund": "quantity", "sku": "sku", "category": "product_category",
    "product categories": "product_category", "customer note": "notes",
}
SHIPROCKET_MAP = {
    "order id": "order_id", "channel order id": "order_id_alt", "shiprocket created at": "order_date",
    "channel created at": "order_date_alt", "order date": "order_date_alt",
    "payment method": "payment_method", "customer pincode": "pincode", "address pincode": "pincode",
    "pincode": "pincode", "customer city": "city", "address city": "city", "customer state": "state",
    "address state": "state", "customer address": "address", "address line 1": "address",
    "address line 2": "address2", "status": "status", "customer name": "customer_name",
    "customer mobile": "customer_phone", "customer phone": "customer_phone", "customer email": "email",
    "order total": "order_value", "product price": "item_price", "product name": "item_name",
    "product sku": "sku", "product quantity": "quantity", "product category": "product_category",
    "channel": "source_channel", "awb code": "awb", "courier company": "courier",
}

# synonyms for fuzzy fallback (normalised)
SYNONYMS: dict[str, list[str]] = {
    "order_id": ["order id", "orderid", "order no", "order number", "order", "order name", "name",
                 "order ref", "reference", "invoice number", "id"],
    "order_date": ["order date", "date", "created at", "created", "order created at", "order time",
                   "timestamp", "placed at", "purchase date", "order datetime"],
    "customer_id": ["customer id", "customer", "buyer id", "user id", "client id"],
    "customer_phone": ["customer phone", "phone", "mobile", "phone number", "mobile number",
                       "contact", "contact number", "customer mobile", "shipping phone", "whatsapp"],
    "customer_name": ["customer name", "name of customer", "buyer name", "full name",
                      "shipping name", "recipient", "consignee", "consignee name"],
    "pincode": ["pincode", "pin code", "pin", "zip", "zipcode", "zip code", "postcode", "postal code",
                "shipping zip", "shipping postcode", "customer pincode", "delivery pincode"],
    "city": ["city", "shipping city", "town", "district", "customer city"],
    "state": ["state", "province", "shipping state", "shipping province", "region", "customer state"],
    "address": ["address", "shipping address", "address line 1", "address1", "street", "full address",
                "delivery address", "shipping address1"],
    "order_value": ["order value", "total", "amount", "order total", "order amount", "grand total",
                    "total amount", "value", "price", "cod amount", "invoice value", "net amount"],
    "payment_method": ["payment method", "payment mode", "payment", "payment type", "mode of payment",
                       "payment gateway", "gateway", "cod prepaid", "payment method title"],
    "product_category": ["product category", "category", "product type", "type", "department"],
    "sku": ["sku", "product sku", "item sku", "variant sku", "lineitem sku"],
    "quantity": ["quantity", "qty", "units", "item quantity", "lineitem quantity", "no of items"],
    "channel": ["channel", "sales channel", "source", "platform", "order source"],
    "outcome": ["outcome", "delivery outcome", "final status", "delivery status", "shipment status",
                "status", "order status", "rto", "rto status", "courier status"],
    "item_name": ["product name", "item name", "product", "item", "lineitem name", "product title", "title"],
    "tags": ["tags", "tag", "labels"],
    "email": ["email", "customer email", "email address"],
}


# --------------------------------------------------------------------------------------
# Value normalisers
# --------------------------------------------------------------------------------------
def _blank(v) -> bool:
    if v is None:
        return True
    if isinstance(v, float) and np.isnan(v):
        return True
    try:
        if v is pd.NaT or (not isinstance(v, str) and pd.isna(v)):
            return True
    except (TypeError, ValueError):
        pass
    return isinstance(v, str) and v.strip().lower() in ("", "nan", "none", "null", "n/a", "na", "-")


def map_outcome(v) -> str | None:
    """Courier/order status text -> DELIVERED | RTO | None."""
    if _blank(v):
        return None
    s = str(v).strip().lower()
    s2 = re.sub(r"[^a-z0-9]+", " ", s).strip()
    if s2 in ("delivered", "rto"):
        return s2.upper()
    rto_kw = ("rto", "return to origin", "returned to origin", "returned", "return delivered",
              "undelivered", "un delivered", "not delivered", "refused", "rejected", "failed delivery",
              "delivery failed", "cancelled after ship", "canceled after ship", "cancelled after dispatch",
              "lost in transit", "return in transit", "return initiated")
    words = set(s2.split())
    if any(k in s2 for k in rto_kw if " " in k) or words & {"rto", "returned", "undelivered", "refused",
                                                             "rejected"}:
        return "RTO"
    if "delivered" in words or s2 in ("completed", "complete", "fulfilled and delivered", "success",
                                     "successful", "delivered successfully"):
        return "DELIVERED"
    if s2 in ("1", "true", "yes", "y"):  # e.g. an "rto" boolean column handled by caller
        return None
    return None


def map_payment(v) -> str | None:
    if _blank(v):
        return None
    s = re.sub(r"[^a-z0-9]+", " ", str(v).lower()).strip()
    if not s:
        return None
    words = set(s.split())
    if ("cod" in words or "cash on delivery" in s or "pay on delivery" in s or "cash" in words
            or s.startswith("cod") or "postpaid" in words or s == "pod"):
        return "COD"
    return "PREPAID"


_PIN_RE = re.compile(r"(?<!\d)([1-9]\d{5})(?!\d)")


def clean_pincode(v) -> str | None:
    if _blank(v):
        return None
    if isinstance(v, (int, np.integer)):
        s = str(int(v))
    elif isinstance(v, float):
        s = str(int(v)) if float(v).is_integer() else str(v)
    else:
        s = str(v).strip().lstrip("'")
        if re.fullmatch(r"\d{6}\.0+", s):
            s = s.split(".")[0]
        s = re.sub(r"(?<=\d)\s+(?=\d)", "", s)  # "110 001" -> "110001"
    m = _PIN_RE.search(s)
    return m.group(1) if m else None


def parse_amount(v) -> float | None:
    if _blank(v):
        return None
    if isinstance(v, (int, float, np.integer, np.floating)):
        f = float(v)
        return f if np.isfinite(f) else None
    s = str(v).replace(",", "")
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    return float(m.group(0)) if m else None


def normalize_phone(v) -> str | None:
    """Return 10-digit Indian mobile when recognisable, else the raw digits (or None)."""
    if _blank(v):
        return None
    if isinstance(v, float) and float(v).is_integer():
        v = str(int(v))
    d = re.sub(r"\D", "", str(v))
    if not d:
        return None
    if len(d) == 12 and d.startswith("91"):
        d = d[2:]
    elif len(d) == 11 and d.startswith("0"):
        d = d[1:]
    return d


CATEGORY_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("Footwear", ("shoe", "sneaker", "sandal", "slipper", "heels", "footwear", "flip flop", "loafer",
                  "boots", "chappal", "jutti", "mojari", "crocs")),
    ("Electronics", ("earbud", "headphone", "earphone", "charger", "cable", "power bank", "powerbank",
                     "speaker", "smartwatch", "smart watch", "mobile", "phone case", "bluetooth", "usb",
                     "trimmer", "led", "neckband", "tws", "adapter", "mouse", "keyboard", "camera")),
    ("Beauty", ("lipstick", "serum", "cream", "face wash", "facewash", "shampoo", "kajal", "perfume",
                "lotion", "moisturi", "sunscreen", "foundation", "nail", "hair oil", "conditioner",
                "makeup", "mascara", "fragrance", "deo", "soap", "skincare", "toner")),
    ("Health", ("protein", "vitamin", "supplement", "ayurved", "capsule", "tablet", "whey", "omega",
                "multivitamin", "immunity", "churna", "health", "sanitizer", "mask")),
    ("Grocery", ("atta", "rice", "dal", "masala", "tea", "coffee", "snack", "ghee", "honey", "oil 1l",
                 "spice", "pickle", "namkeen", "dry fruit", "almond", "cashew", "millet", "flour", "sugar")),
    ("Home & Kitchen", ("bottle", "cookware", "bedsheet", "bed sheet", "pan", "kitchen", "lamp", "cushion",
                        "curtain", "towel", "mug", "tiffin", "container", "decor", "pillow", "blanket",
                        "kadai", "tawa", "pressure cooker", "organizer", "mat", "vase", "plate")),
    ("Accessories", ("wallet", "belt", "bag", "sunglass", "jewel", "earring", "necklace", "bracelet",
                     "watch", "ring", "clutch", "handbag", "backpack", "cap", "scarf", "dupatta set",
                     "hair clip", "bangle", "anklet")),
    ("Fashion", ("kurta", "kurti", "saree", "sari", "shirt", "dress", "t shirt", "tshirt", "jeans", "top",
                 "lehenga", "trouser", "pant", "hoodie", "jacket", "legging", "dupatta", "salwar", "suit",
                 "skirt", "shorts", "co ord", "nightwear", "pyjama", "sweater", "blazer", "anarkali")),
]


def infer_category(name) -> str:
    if _blank(name):
        return "Other"
    s = " " + re.sub(r"[^a-z0-9]+", " ", str(name).lower()) + " "
    for cat, kws in CATEGORY_KEYWORDS:
        for k in kws:
            if (" " + k) in s:
                return cat
    return "Other"


_CANON_CATS = {"fashion": "Fashion", "apparel": "Fashion", "clothing": "Fashion", "footwear": "Footwear",
               "shoes": "Footwear", "electronics": "Electronics", "beauty": "Beauty",
               "cosmetics": "Beauty", "personal care": "Beauty", "home and kitchen": "Home & Kitchen",
               "home": "Home & Kitchen", "kitchen": "Home & Kitchen", "home decor": "Home & Kitchen",
               "grocery": "Grocery", "food": "Grocery", "accessories": "Accessories",
               "jewellery": "Accessories", "jewelry": "Accessories", "health": "Health",
               "wellness": "Health", "health and wellness": "Health"}


def normalize_category(v, item_name=None) -> str:
    if not _blank(v):
        n = _norm(v)
        if n in _CANON_CATS:
            return _CANON_CATS[n]
        inf = infer_category(v)
        if inf != "Other":
            return inf
        if _blank(item_name):
            return str(v).strip()[:40]
    return infer_category(item_name)


def map_channel(v, default: str) -> str:
    if _blank(v):
        return default
    s = _norm(v)
    if s in VALID_CHANNELS:
        return s
    for key, ch in (("insta", "instagram"), ("whatsapp", "whatsapp"), ("wa", "whatsapp"),
                    ("shopify", "shopify"), ("woo", "woocommerce"), ("web", "website"),
                    ("online store", "website"), ("custom", "website"), ("manual", "manual"),
                    ("pos", "manual"), ("phone", "manual")):
        if key in s.split() or (len(key) > 2 and key in s):
            return ch
    return default


_TZ_RE = re.compile(r"(?:[+-]\d{2}:?\d{2}|Z|UTC|GMT)\s*$", re.I)


def parse_dates(series: pd.Series) -> pd.Series:
    """Parse to tz-naive IST datetimes. Strings with offsets are converted to IST."""
    s = series.copy()
    if pd.api.types.is_datetime64_any_dtype(s):
        if getattr(s.dt, "tz", None) is not None:
            return s.dt.tz_convert("Asia/Kolkata").dt.tz_localize(None)
        return s
    st = s.astype("string").str.strip()
    has_tz = st.fillna("").str.contains(_TZ_RE)
    out = pd.Series(pd.NaT, index=s.index, dtype="datetime64[ns]")
    if has_tz.any():
        tzp = pd.to_datetime(st[has_tz], errors="coerce", utc=True, format="mixed")
        out.loc[has_tz] = tzp.dt.tz_convert("Asia/Kolkata").dt.tz_localize(None)
    rest = ~has_tz & st.notna()
    if rest.any():
        vals = st[rest]
        # day-first if any slash/dash date has first component > 12
        first = vals.str.extract(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.]\d{2,4}")
        dayfirst = bool(first[0].dropna().astype(int).gt(12).any()) if not first.empty else False
        if not dayfirst and not first[0].dropna().empty:
            dayfirst = not bool(first[1].dropna().astype(int).gt(12).any())  # Indian default
        p = pd.to_datetime(vals, errors="coerce", format="mixed", dayfirst=dayfirst)
        if getattr(p.dt, "tz", None) is not None:
            p = p.dt.tz_convert("Asia/Kolkata").dt.tz_localize(None)
        out.loc[rest] = p
    return out


# --------------------------------------------------------------------------------------
# Detection & column mapping
# --------------------------------------------------------------------------------------
def _detect_format(norm_headers: set[str]) -> str:
    if {"name", "lineitem name"} <= norm_headers or {"name", "financial status"} <= norm_headers:
        return "shopify"
    if "shiprocket created at" in norm_headers or ("customer pincode" in norm_headers and "order id" in norm_headers) \
            or ("awb code" in norm_headers and "courier company" in norm_headers):
        return "shiprocket"
    if "order number" in norm_headers and ({"shipping postcode", "order total amount", "postcode shipping",
                                             "payment method title", "order status"} & norm_headers):
        return "woocommerce"
    canon = {c.replace("_", " ") for c in CANONICAL_COLUMNS}
    if len(canon & norm_headers) >= 8 and {"order id", "pincode", "payment method"} <= norm_headers:
        return "canonical"
    return "unknown"


def _build_column_map(columns: list, fmt: str) -> dict[str, str]:
    """raw header -> internal field."""
    norm = {c: _norm(c) for c in columns}
    fmt_map = {"shopify": SHOPIFY_MAP, "woocommerce": WOO_MAP, "shiprocket": SHIPROCKET_MAP}.get(fmt, {})
    cmap: dict[str, str] = {}
    used: set[str] = set()
    if fmt == "canonical":
        for c, n in norm.items():
            f = n.replace(" ", "_")
            if f in CANONICAL_COLUMNS and f not in used:
                cmap[c] = f
                used.add(f)
    for c, n in norm.items():
        if c in cmap:
            continue
        f = fmt_map.get(n)
        if f and f not in used:
            cmap[c] = f
            used.add(f)
    # fuzzy fallback: exact synonym match, then containment
    for field_, syns in SYNONYMS.items():
        if field_ in used:
            continue
        for c, n in norm.items():
            if c in cmap:
                continue
            if n == field_.replace("_", " ") or n in syns:
                cmap[c] = field_
                used.add(field_)
                break
    for field_, syns in SYNONYMS.items():
        if field_ in used or field_ in ("outcome", "channel", "tags", "customer_id", "order_id"):
            continue
        for c, n in norm.items():
            if c in cmap:
                continue
            if any(len(s) > 3 and (s in n) for s in syns):
                cmap[c] = field_
                used.add(field_)
                break
    return cmap


def _channel_for(fmt: str, src, default: str) -> str:
    ch = map_channel(src, default)
    if fmt in ("shopify", "woocommerce") and ch not in ("instagram", "whatsapp"):
        return default
    return ch


def _first_valid(s: pd.Series):
    for v in s:
        if not _blank(v):
            return v
    return None


def _cust_id(phone, email, name, pincode) -> str | None:
    for key in (phone, email):
        if not _blank(key):
            return "C-" + hashlib.sha1(str(key).strip().lower().encode()).hexdigest()[:10]
    if not _blank(name) and not _blank(pincode):
        return "C-" + hashlib.sha1(f"{str(name).strip().lower()}|{pincode}".encode()).hexdigest()[:10]
    return None


def detect_and_map(df_raw: pd.DataFrame) -> MappingResult:
    warnings: list[str] = []
    dropped: list[dict] = []
    dropped_count = 0
    rows_in = int(len(df_raw)) if df_raw is not None else 0

    def drop(idx, reason):
        nonlocal dropped_count
        dropped_count += 1
        if len(dropped) < 50:
            try:
                r = int(idx) + 2  # 1-based + header line, matches spreadsheet row numbers
            except (TypeError, ValueError):
                r = str(idx)
            dropped.append({"row": r, "reason": reason})

    if df_raw is None or df_raw.shape[1] == 0:
        return MappingResult(pd.DataFrame(columns=CANONICAL_COLUMNS), "unknown", {},
                             _report(0, pd.DataFrame(columns=CANONICAL_COLUMNS), [], 0,
                                     ["Empty file / no columns"]))

    raw = df_raw.copy()
    raw = raw.loc[:, [c for c in raw.columns if not str(c).startswith("Unnamed")]]
    raw = raw.reset_index(drop=True)
    norm_headers = {_norm(c) for c in raw.columns}
    fmt = _detect_format(norm_headers)
    cmap = _build_column_map(list(raw.columns), fmt)
    work = pd.DataFrame({f: raw[c] for c, f in cmap.items()})
    work["__row"] = raw.index

    # ---- format-specific pre-processing ----
    if "order_id" not in work and "order_id_alt" in work:
        work["order_id"] = work["order_id_alt"]
    if "order_date" not in work and "order_date_alt" in work:
        work["order_date"] = work["order_date_alt"]
    if "customer_name" not in work:
        if "first_name" in work or "last_name" in work:
            work["customer_name"] = (work.get("first_name", pd.Series("", index=work.index)).fillna("").astype(str)
                                     + " " + work.get("last_name", pd.Series("", index=work.index))
                                     .fillna("").astype(str)).str.strip()
        elif "bfirst_name" in work:
            work["customer_name"] = (work["bfirst_name"].fillna("").astype(str) + " "
                                     + work.get("blast_name", pd.Series("", index=work.index))
                                     .fillna("").astype(str)).str.strip()
        elif "billing_name" in work:
            work["customer_name"] = work["billing_name"]
    for alt in ("shipping_phone", "billing_phone"):
        if alt in work:
            work["customer_phone"] = work["customer_phone"].where(
                ~work["customer_phone"].map(_blank), work[alt]) if "customer_phone" in work else work[alt]
    if "billing_zip" in work:
        work["pincode"] = work["pincode"].where(~work["pincode"].map(_blank), work["billing_zip"]) \
            if "pincode" in work else work["billing_zip"]
    if "address_alt" in work and "address" not in work:
        work["address"] = work["address_alt"]
    if "address2" in work and "address" in work:
        a2 = work["address2"].map(lambda v: "" if _blank(v) else ", " + str(v).strip())
        work["address"] = work["address"].map(lambda v: "" if _blank(v) else str(v).strip()) + a2
    if "payment_method" not in work and "payment_method_code" in work:
        work["payment_method"] = work["payment_method_code"]

    if "order_id" not in work:
        warnings.append("No order id column found - generated sequential ids")
        work["order_id"] = [f"ROW{i + 1}" for i in range(len(work))]

    # ---- aggregate multi-row line items (Shopify style) ----
    work["order_id"] = work["order_id"].map(lambda v: None if _blank(v) else str(v).strip())
    no_id = work["order_id"].isna()
    for idx in work.index[no_id]:
        drop(work.at[idx, "__row"], "missing order id")
    work = work[~no_id]

    exact_dupes = work.drop(columns="__row").astype(str).duplicated()
    if exact_dupes.any():
        warnings.append(f"Removed {int(exact_dupes.sum())} exact duplicate rows")
        work = work[~exact_dupes.values]

    if "quantity" in work:
        work["quantity"] = work["quantity"].map(lambda v: parse_amount(v))
    multi = work["order_id"].duplicated(keep=False)
    if multi.any():
        n_multi = int(work.loc[multi, "order_id"].nunique())
        warnings.append(f"Aggregated {int(multi.sum())} line-item rows into {n_multi} orders")
        agg = {c: _first_valid for c in work.columns if c not in ("order_id", "quantity", "__row")}
        if "quantity" in work:
            agg["quantity"] = lambda s: float(np.nansum([x for x in s if x is not None])) or None
        agg["__row"] = "first"
        work = work.groupby("order_id", sort=False, as_index=False).agg(agg)

    # ---- build canonical frame row-wise with validation ----
    default_channel = {"shopify": "shopify", "woocommerce": "woocommerce"}.get(fmt, "website" if fmt == "shiprocket" else "manual")
    dates = parse_dates(work["order_date"]) if "order_date" in work else None
    if dates is None:
        warnings.append("No order date column found - using import time")
    now = pd.Timestamp.now().floor("s")

    recs = []
    pay_guessed = 0
    cat_inferred = 0
    for i, (idx, r) in enumerate(work.iterrows()):
        try:
            rown = r["__row"]
            pin = clean_pincode(r.get("pincode"))
            if pin is None:
                drop(rown, f"invalid pincode: {r.get('pincode')!r}")
                continue
            val = parse_amount(r.get("order_value"))
            if val is None and "item_price" in r:
                val = parse_amount(r.get("item_price"))
            if val is None or val <= 0:
                drop(rown, f"invalid order value: {r.get('order_value')!r}")
                continue
            if dates is not None:
                dt = dates.loc[idx]
                if pd.isna(dt):
                    drop(rown, f"unparseable order date: {r.get('order_date')!r}")
                    continue
            else:
                dt = now
            pm = map_payment(r.get("payment_method"))
            if pm is None:
                fs = str(r.get("financial_status") or "").lower()
                if fs:
                    pm = "PREPAID" if fs in ("paid", "partially_refunded", "refunded", "authorized") else "COD"
                    pay_guessed += 1
                else:
                    pm = "COD"
                    pay_guessed += 1
            # outcome
            outcome = None
            for col in ("outcome", "status", "fulfillment_status"):
                if col in r and not _blank(r.get(col)):
                    outcome = map_outcome(r.get(col))
                    if outcome:
                        break
            if outcome is None and "tags" in r and not _blank(r.get("tags")):
                tags = [t.strip().lower() for t in re.split(r"[,;|]", str(r.get("tags")))]
                if any(t in ("rto", "rto delivered", "returned", "rto-delivered", "rto_delivered") or t.startswith("rto")
                       for t in tags):
                    outcome = "RTO"
                elif "delivered" in tags:
                    outcome = "DELIVERED"
            raw_cat = r.get("product_category")
            item = r.get("item_name")
            if _blank(raw_cat):
                cat_inferred += 1
            cat = normalize_category(raw_cat, item)
            qty = r.get("quantity")
            try:
                qty = int(qty) if qty is not None and not _blank(qty) and float(qty) > 0 else 1
            except (TypeError, ValueError):
                qty = 1
            phone = normalize_phone(r.get("customer_phone"))
            name = None if _blank(r.get("customer_name")) else str(r.get("customer_name")).strip()
            cid = r.get("customer_id")
            cid = None if _blank(cid) else str(cid).strip()
            if cid is not None and re.fullmatch(r"\d+\.0", cid):
                cid = cid[:-2]
            if cid is None or cid == "0":
                cid = _cust_id(phone, r.get("email"), name, pin) or f"C-anon-{r['order_id']}"
            ch_src = r.get("channel") if "channel" in r else r.get("source_channel")
            recs.append({
                "order_id": str(r["order_id"]),
                "order_date": pd.Timestamp(dt).to_pydatetime(),
                "customer_id": cid,
                "customer_phone": phone,
                "customer_name": name,
                "pincode": pin,
                "city": None if _blank(r.get("city")) else str(r.get("city")).strip().title(),
                "state": None if _blank(r.get("state")) else str(r.get("state")).strip(),
                "address": None if _blank(r.get("address")) else str(r.get("address")).strip(),
                "order_value": round(float(val), 2),
                "payment_method": pm,
                "product_category": cat,
                "sku": None if _blank(r.get("sku")) else str(r.get("sku")).strip(),
                "quantity": qty,
                "channel": _channel_for(fmt, ch_src, default_channel),
                "outcome": outcome,
            })
        except Exception as e:  # never crash on a bad row
            drop(r.get("__row", i), f"parse error: {type(e).__name__}: {e}")

    out = pd.DataFrame(recs, columns=CANONICAL_COLUMNS)
    if len(out):
        out["order_date"] = pd.to_datetime(out["order_date"])
        out["order_value"] = out["order_value"].astype(float)
        out["quantity"] = out["quantity"].astype(int)
        out = out.sort_values("order_date", kind="stable").reset_index(drop=True)
        out = out.astype({c: object for c in ("outcome", "customer_phone", "customer_name", "city",
                                             "state", "address", "sku")})
        for c in ("outcome", "customer_phone", "customer_name", "city", "state", "address", "sku"):
            out[c] = out[c].map(lambda v: None if _blank(v) else v)
    if pay_guessed:
        warnings.append(f"Payment method missing/unrecognised for {pay_guessed} orders - inferred "
                        f"(financial status or default COD)")
    if cat_inferred:
        warnings.append(f"Product category inferred from product name for {cat_inferred} orders")
    if len(out) and out["outcome"].isna().all():
        warnings.append("No delivery outcome (DELIVERED/RTO) found - rows imported as unlabelled")
    missing_cols = [c for c in ("order_date", "payment_method", "pincode", "order_value") if c not in work]
    for c in missing_cols:
        warnings.append(f"Column for '{c}' not found")
    column_map = {str(c): f for c, f in cmap.items()}
    return MappingResult(out, fmt, column_map, _report(rows_in, out, dropped, dropped_count, warnings))


def _report(rows_in: int, out: pd.DataFrame, dropped: list, dropped_count: int, warnings: list) -> dict:
    missing = {c: int(out[c].isna().sum()) if c in out else int(len(out)) for c in CANONICAL_COLUMNS}
    oc = out["outcome"] if "outcome" in out else pd.Series(dtype=object)
    dist = {"DELIVERED": int((oc == "DELIVERED").sum()), "RTO": int((oc == "RTO").sum()),
            "unknown": int(oc.isna().sum())}
    date_range = None
    if len(out) and "order_date" in out and out["order_date"].notna().any():
        date_range = [out["order_date"].min().isoformat(), out["order_date"].max().isoformat()]
    return {"rows_in": int(rows_in), "rows_out": int(len(out)), "dropped": dropped,
            "dropped_count": int(dropped_count), "warnings": warnings, "missing_by_column": missing,
            "outcome_distribution": dist, "date_range": date_range}


def read_any(path_or_buffer, filename: str | None = None) -> pd.DataFrame:
    """Convenience reader: CSV (auto-delimiter, utf-8/latin-1) or Excel; all columns as str."""
    name = (filename or str(path_or_buffer)).lower()
    if name.endswith((".xlsx", ".xls")):
        return pd.read_excel(path_or_buffer, dtype=str)
    try:
        return pd.read_csv(path_or_buffer, dtype=str, sep=None, engine="python", encoding="utf-8-sig")
    except UnicodeDecodeError:
        if hasattr(path_or_buffer, "seek"):
            path_or_buffer.seek(0)
        return pd.read_csv(path_or_buffer, dtype=str, sep=None, engine="python", encoding="latin-1")


__all__ = ["CANONICAL_COLUMNS", "MappingResult", "detect_and_map", "map_outcome", "map_payment",
           "clean_pincode", "infer_category", "read_any", "normalize_phone"]
