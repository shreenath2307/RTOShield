# 08 - Turkish E-Commerce Product Returns (Hugging Face)

- Source: https://huggingface.co/datasets/EgehanK/turkish-ecommerce-product-returns (CC BY 4.0). 3 MB parquet, 30,411 rows. Status: DOWNLOADED `raw/train.parquet` (needs pyarrow to read).
- Columns (per card): productId, productName, brand, productUrl, price, averageRating, reviewRating, reviewText (Turkish).
- Mapping: only price/product/brand; reviews of returned products. Not an order-level table; no customer, payment or outcome label.
- Relevance: 1/5. Possible return-reason NLP or category return-propensity priors, not RTO risk.
- Limitations: text only, no negatives, no orders.
