# 07 - Kaggle "E-Commerce Shipping Data" (on-time delivery)

- Source: https://www.kaggle.com/datasets/prachi13/customer-analytics - LOGIN REQUIRED, not downloaded.
- Command: `kaggle datasets download -d prachi13/customer-analytics` (license: check page).
- Size (third-party reports, not verified by me): ~10,999 rows x 12 cols; target `Reached.on.Time_Y.N` (1 = not on time, ~59.7% late).
- Columns: ID, Warehouse_block, Mode_of_Shipment, Customer_care_calls, Customer_rating, Cost_of_the_Product, Prior_purchases, Product_importance, Gender, Discount_offered, Weight_in_gms, Reached.on.Time_Y.N.
- Mapping: order_value~Cost_of_the_Product, repeat history~Prior_purchases, outcome proxy = late. No payment method, geography or dates.
- Relevance: 1/5 (likely synthetic, no COD, no pincode). Toy benchmark only.
