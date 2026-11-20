# 03 - UCI Online Retail

- Source: https://archive.ics.uci.edu/dataset/352/online+retail (CC BY 4.0). Direct: https://archive.ics.uci.edu/static/public/352/online+retail.zip
- Size: 23 MB zip, ~541,909 rows (UK retailer, 2010-11). Status: DOWNLOADED and unzipped `raw/Online Retail.xlsx`.
- Columns: InvoiceNo (prefix C = cancellation), StockCode, Description, Quantity, InvoiceDate, UnitPrice, CustomerID, Country.

## Mapping
order_id=InvoiceNo, order_date=InvoiceDate, customer_id=CustomerID, order_value=Quantity*UnitPrice, product_category (derive from Description), quantity. Outcome proxy: C-prefix/negative-quantity invoice => RTO-like reversal.

## Relevance: 2/5
Only for repeat-customer history and cancellation-rate feature engineering.

## Limitations
No payment method, geography only country, no delivery data, wholesale-heavy, cancellations not linked to original invoice.
