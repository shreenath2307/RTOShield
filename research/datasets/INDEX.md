# Public Datasets for RTO Shield - Index

Reality check: no public dataset found has a true COD RTO label with Indian pincodes. All are proxies. India-specific data is in `../india-data/`.

| Rank | Dataset | Relevance | Status | Verdict |
|---|---|---|---|---|
| 1 | [01 Olist](01-olist/README.md) | 4/5 | downloaded (127 MB) | Real order-level data: canceled/unavailable status, boleto (offline pay, COD-like), zip prefix, repeat customers, categories, timestamps. Non-commercial license. |
| 2 | [02 DataCo](02-dataco/README.md) | 3/5 | downloaded (96 MB) | `Type=CASH` flag, CANCELED/SUSPECTED_FRAUD status, categories, regions; semi-synthetic, leaky late label. |
| 3 | [03 UCI Online Retail](03-uci-online-retail/README.md) | 2/5 | downloaded | Cancellation invoices and repeat-customer history only. |
| 4 | [04 UCI Online Retail II](04-uci-online-retail-ii/README.md) | 2/5 | downloaded | Bigger version of 03; same use. |
| 5 | [06 Amazon Last Mile](06-amazon-last-mile/README.md) | 2/5 | partial, 454 MB (CC BY-NC) | Only set with per-package DELIVERY_ATTEMPTED (11k) / REJECTED (32); no order features. |
| 6 | [09 Amazon Delivery India](09-amazon-delivery-india/README.md) | 2/5 | login-required | India, but delivery time only. |
| 7 | [10 ASOS GraphReturns](10-asos-graphreturns/README.md) | 2/5 | link unverified | Return labels at scale; fashion, not RTO. |
| 8 | [05 LaDe](05-lade/README.md) | 1/5 | sample only (Jilin 4.7 MB) | Courier/geo delivery-time only. |
| 9 | [07 Kaggle E-Commerce Shipping](07-kaggle-ecommerce-shipping/README.md) | 1/5 | login-required | Toy on-time dataset. |
| 10 | [08 Turkish Product Returns](08-turkish-product-returns/README.md) | 1/5 | downloaded (3 MB) | Return review text; no order labels. |

## Recommendation: use first
1. **Olist (primary proxy).** Build a canonical frame (customer_unique_id, zip prefix, payment_value, boleto vs card, category, purchase hour). Label = canceled/unavailable (RTO-like), optionally late by more than N days. Use it to validate pipeline mechanics: leakage-safe pincode/customer target encoding, time-based split, calibration. Positive rate is only ~1%, so report PR-AUC against the base rate and do not claim Indian accuracy.
2. **DataCo (secondary).** Use `Type=CASH` as the COD flag and Order Status cancellations/fraud as the label to test COD, value and category effects. Drop `Days for shipping (real)` and `Delivery Status` to avoid leakage; treat as semi-synthetic.
3. **UCI Online Retail II (feature prototyping).** Repeat-customer and cancel-rate history features; no payment or geography.

Final models must be calibrated and priored with India benchmark data (pincode RTO rates, 25-30% COD base rate) and real seller data via the cold-start blend. These public sets cannot supply Indian COD base rates.

Licenses: Olist CC BY-NC-SA and Amazon Last Mile CC BY-NC mean research/validation only. DataCo and UCI are CC BY 4.0. LaDe is tagged Apache-2.0.
