"""Generate sample import files in backend/sample_data/.

Run from backend/:  .venv/Scripts/python -m app.data.make_samples
"""
from __future__ import annotations

import zlib
from pathlib import Path

import numpy as np
import pandas as pd

from app.data.synthetic import generate_orders

OUT = Path(__file__).resolve().parents[2] / "sample_data"

PRODUCTS = {
    "Fashion": ["Cotton Kurta - Indigo", "Floral Printed Saree", "Men's Slim Fit Shirt", "Anarkali Kurti Set",
                "Oversized T-Shirt", "High Rise Jeans"],
    "Footwear": ["Running Shoes - Black", "Kolhapuri Chappal", "Casual Sneakers", "Block Heels Sandal"],
    "Electronics": ["TWS Earbuds Pro", "20000mAh Power Bank", "Smart Watch X2", "Bluetooth Speaker Mini",
                    "Fast Charger 33W"],
    "Beauty": ["Vitamin C Face Serum", "Matte Lipstick - Rose", "Kumkumadi Face Cream", "Onion Hair Oil 200ml"],
    "Home & Kitchen": ["Copper Water Bottle 1L", "Cotton Double Bedsheet", "Non-Stick Tawa", "Ceramic Mug Set"],
    "Grocery": ["Organic Ghee 500ml", "Assam Tea 250g", "Kashmiri Almonds 500g", "Garam Masala 100g"],
    "Accessories": ["Leather Wallet - Brown", "Oxidised Jhumka Earrings", "Canvas Backpack", "Aviator Sunglasses"],
    "Health": ["Whey Protein 1kg", "Ashwagandha Capsules", "Multivitamin Tablets 60s", "Omega 3 Fish Oil"],
}
SHOPIFY_COD = "Cash on Delivery (COD)"
SHOPIFY_PREPAID = ["Razorpay Secure (UPI, Cards, Wallets, NetBanking)", "PhonePe Payment Gateway", "Cashfree"]


def _product(rng, cat):
    return PRODUCTS[cat][rng.integers(0, len(PRODUCTS[cat]))]


def make_shopify(n=300, seed=7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    df = generate_orders(n, seed=seed, start="2026-04-01", days=200)
    rows = []
    for i, o in df.iterrows():
        cod = o.payment_method == "COD"
        tags = ["cod" if cod else "prepaid"]
        if o.outcome == "RTO":
            tags.append(rng.choice(["RTO", "rto-delivered", "RTO"]))
        else:
            tags.append("delivered")
        n_items = 2 if rng.random() < 0.2 else 1
        prices = [o.order_value] if n_items == 1 else [round(o.order_value * 0.6), o.order_value - round(o.order_value * 0.6)]
        for k in range(n_items):
            base = {c: "" for c in COLS_SHOPIFY}
            base.update({"Name": f"#{1001 + i}", "Lineitem quantity": int(o.quantity) if k == 0 else 1,
                         "Lineitem name": _product(rng, o.product_category), "Lineitem price": prices[k],
                         "Lineitem sku": o.sku if k == 0 else f"{o.sku}-B", "Lineitem fulfillment status": "fulfilled"})
            if k == 0:
                ts = pd.Timestamp(o.order_date).strftime("%Y-%m-%d %H:%M:%S +0530")
                base.update({
                    "Email": f"{o.customer_name.split()[0].lower()}{zlib.crc32(o.customer_id.encode()) % 1000}@example.com",
                    "Financial Status": "pending" if cod else "paid",
                    "Paid at": "" if cod else ts, "Fulfillment Status": "fulfilled", "Fulfilled at": ts,
                    "Accepts Marketing": rng.choice(["yes", "no"]), "Currency": "INR",
                    "Subtotal": o.order_value, "Shipping": 0, "Taxes": round(o.order_value * 0.05, 2),
                    "Total": o.order_value, "Discount Code": "", "Discount Amount": 0,
                    "Shipping Method": "Standard", "Created at": ts,
                    "Billing Name": o.customer_name, "Billing Zip": f"'{o.pincode}", "Billing Country": "IN",
                    "Shipping Name": o.customer_name, "Shipping Street": o.address,
                    "Shipping Address1": o.address, "Shipping Address2": "", "Shipping City": o.city,
                    "Shipping Zip": f"'{o.pincode}", "Shipping Province": o.state, "Shipping Country": "IN",
                    "Shipping Phone": f"+91 {o.customer_phone}" if rng.random() < 0.6 else o.customer_phone,
                    "Notes": "", "Payment Method": SHOPIFY_COD if cod else rng.choice(SHOPIFY_PREPAID),
                    "Tags": ", ".join(tags), "Source": "web", "Phone": "",
                    "Id": 5600000000000 + i,
                })
            rows.append(base)
    out = pd.DataFrame(rows, columns=COLS_SHOPIFY).astype(object)
    # a couple of junk rows to exercise the quality report
    out.loc[len(out)] = {**{c: "" for c in COLS_SHOPIFY}, "Name": "#9998", "Created at": "2026-05-01 10:00:00 +0530",
                         "Total": 999, "Shipping Zip": "ABC12", "Lineitem name": "Cotton Kurta", "Payment Method": SHOPIFY_COD}
    out.loc[len(out)] = {**{c: "" for c in COLS_SHOPIFY}, "Name": "#9999", "Created at": "not a date",
                         "Total": 499, "Shipping Zip": "'560001", "Lineitem name": "Face Serum", "Payment Method": "Razorpay"}
    return out


COLS_SHOPIFY = ["Name", "Email", "Financial Status", "Paid at", "Fulfillment Status", "Fulfilled at",
                "Accepts Marketing", "Currency", "Subtotal", "Shipping", "Taxes", "Total", "Discount Code",
                "Discount Amount", "Shipping Method", "Created at", "Lineitem quantity", "Lineitem name",
                "Lineitem price", "Lineitem sku", "Lineitem fulfillment status", "Billing Name", "Billing Zip",
                "Billing Country", "Shipping Name", "Shipping Street", "Shipping Address1", "Shipping Address2",
                "Shipping City", "Shipping Zip", "Shipping Province", "Shipping Country", "Shipping Phone",
                "Notes", "Payment Method", "Tags", "Source", "Phone", "Id"]


def make_woocommerce(n=300, seed=8) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    df = generate_orders(n, seed=seed, start="2026-03-01", days=230)
    rows = []
    for i, o in df.iterrows():
        cod = o.payment_method == "COD"
        status = "Completed" if o.outcome == "DELIVERED" else rng.choice(["RTO", "Returned", "RTO Delivered"])
        first, *rest = o.customer_name.split()
        rows.append({
            "Order Number": 2001 + i,
            "Order Date": pd.Timestamp(o.order_date).strftime("%Y-%m-%d %H:%M"),
            "Order Status": status,
            "First Name (Shipping)": first, "Last Name (Shipping)": " ".join(rest),
            "Phone (Billing)": o.customer_phone,
            "Email (Billing)": f"{first.lower()}.{i}@example.in",
            "Shipping Address 1": o.address, "Shipping City": o.city, "Shipping State": o.state,
            "Shipping Postcode": o.pincode,
            "Payment Method Title": "Cash on delivery" if cod else rng.choice(["Razorpay", "UPI / Cards (PayU)",
                                                                                "Paytm"]),
            "Order Total Amount": f"{o.order_value:,.2f}",
            "Item Name": _product(rng, o.product_category), "Quantity": int(o.quantity), "SKU": o.sku,
            "Customer User ID": 0 if rng.random() < 0.5 else 3000 + zlib.crc32(o.customer_id.encode()) % 5000,
        })
    out = pd.DataFrame(rows).astype(object)
    out.loc[len(out)] = {**{c: "" for c in out.columns}, "Order Number": 9999, "Order Date": "2026-06-01 12:00",
                         "Order Status": "Completed", "Shipping Postcode": "12", "Order Total Amount": "1,299.00"}
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    make_shopify().to_csv(OUT / "shopify_orders_sample.csv", index=False)
    make_woocommerce().to_csv(OUT / "woocommerce_orders_sample.csv", index=False)
    canon = generate_orders(2000, seed=11, start="2025-11-01", days=365)
    canon["order_date"] = canon["order_date"].dt.strftime("%Y-%m-%d %H:%M:%S")
    canon.to_csv(OUT / "canonical_orders_sample.csv", index=False)
    new = generate_orders(50, seed=99, start=pd.Timestamp.now().strftime("%Y-%m-%d"), days=1, with_outcome=False)
    new = new.drop(columns=["outcome"])
    new["order_id"] = [f"NEW{5001 + i}" for i in range(len(new))]
    new["order_date"] = new["order_date"].dt.strftime("%Y-%m-%d %H:%M:%S")
    new.to_csv(OUT / "new_orders_to_score.csv", index=False)
    print("wrote samples to", OUT)


if __name__ == "__main__":
    main()
