# 02 - DataCo Smart Supply Chain for Big Data Analysis

- Source: https://data.mendeley.com/datasets/8gx2fvg2k6/5 (CC BY 4.0, DOI 10.17632/8gx2fvg2k6.5). Downloaded from HF mirror https://huggingface.co/datasets/aryadevkota/dataco_supplychain_dataset (Mendeley direct file URL is not scriptable).
- Size: 96 MB CSV, 180,519 rows x 53 cols (latin-1 encoding). Status: DOWNLOADED `raw/DataCoSupplyChainDataset.csv`.
- Key columns: Type (DEBIT 69,295 / TRANSFER 49,883 / PAYMENT 41,725 / CASH 19,616), Days for shipping (real/scheduled), Delivery Status (Late 98,977 / Advance 41,592 / On time 32,196 / Shipping canceled 7,754), Late_delivery_risk (0/1), Order Status (COMPLETE, CLOSED, CANCELED 3,692, SUSPECTED_FRAUD 4,062, ON_HOLD, PENDING...), Sales, Order Item Quantity, Category Name, Customer Id, Customer City/State/Zipcode, Order Region/Country, order date, shipping date, Shipping Mode, Market.

## Mapping
- payment_method: Type=CASH => COD proxy, others PREPAID. order_value=Sales; order_date; customer_id; product_category=Category Name; city/state/zip (zip largely missing).
- outcome proxy: CANCELED / SUSPECTED_FRAUD / Shipping canceled => RTO-like; Late_delivery_risk=1 => delay proxy.

## Relevance: 3/5
Has a CASH flag, order status and categories.

## Limitations
Late label is leaky (derived from real vs scheduled days; drop "Days for shipping (real)" and "Delivery Status"); data looks semi-synthetic; PII masked; not India; no pincode signal; "CASH" is a transaction type, not confirmed COD.
