# 09 - Amazon Delivery Dataset (India, Kaggle)

- Source: Kaggle "Amazon Delivery Dataset" (reported ~43,739 rows x 16 cols, Indian cities). Slug NOT verified; likely `sujalsuthar/amazon-delivery-dataset`. LOGIN REQUIRED, not downloaded.
- Command: `kaggle datasets download -d sujalsuthar/amazon-delivery-dataset` (confirm slug first with `kaggle datasets list -s "amazon delivery"`).
- Columns (reported): Order_ID, Agent_Age, Agent_Rating, store/drop lat-lng, Order_Date, Order_Time, Pickup_Time, Weather, Traffic, Vehicle, Area, Delivery_Time (minutes), Category.
- Mapping: order_date/time (time-of-day feature), area type, category. Outcome = delivery duration only.
- Relevance: 2/5 (India, but no failure/COD/pincode; provenance unclear, possibly synthetic).
