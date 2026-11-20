# 01 - Olist Brazilian E-Commerce

- Source: https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce (original, needs login). Downloaded from public HF mirror https://huggingface.co/datasets/bulutttt/olist-raw-data (no login; the mirror has no license tag).
- Original license: CC BY-NC-SA 4.0 (non-commercial, share-alike). Verify on the Kaggle page.
- Kaggle command: `kaggle datasets download -d olistbr/brazilian-ecommerce`
- Size: ~127 MB, 9 CSVs, ~100k orders (2016-2018). Status: DOWNLOADED to `raw/`.
- Tables/columns: orders (order_id, customer_id, order_status, purchase/approved/carrier/customer-delivered/estimated timestamps); order_items (product_id, seller_id, price, freight_value); order_payments (payment_type, installments, payment_value); customers (customer_unique_id, zip prefix, city, state); products (category, weight, dims); sellers; reviews; geolocation (zip prefix to lat/lng).
- Verified counts: order_status delivered 96,478 / shipped 1,107 / canceled 625 / unavailable 609 / invoiced 314 / processing 301. payment_type: credit_card 76,795 / boleto 19,784 / voucher 5,775 / debit_card 1,529.

## Mapping to canonical schema
- order_id, order_date (purchase timestamp), customer_id (use customer_unique_id for repeat history), pincode (zip prefix, 5 digits, proxy), city, state, order_value (payment_value, BRL), product_category (translated), quantity (item count).
- payment_method: boleto is the closest proxy to COD (offline pay-later, can go unpaid); credit_card is PREPAID.
- channel: absent.
- outcome proxies: canceled/unavailable => RTO-like; delivered => DELIVERED. Late vs estimated date is a secondary label. No true RTO label.

## Relevance: 4/5
Best-structured open proxy: real regional effects, repeat customers, categories, time of day.

## Limitations
Brazil/BRL; no COD (boleto only a proxy); cancellations are not refusals; ~1% positive rate; late-delivery (~8%) is a different target; non-commercial license; 2016-18.
