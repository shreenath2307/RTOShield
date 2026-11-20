# 05 - LaDe (Cainiao last-mile delivery)

- Source: https://huggingface.co/datasets/Cainiao-AI/LaDe (Apache-2.0 tag; card says research use). Paper https://arxiv.org/abs/2306.10675 ; code https://github.com/wenhaomin/LaDe
- Size: 10.7M packages, 21k couriers, 5 Chinese cities, 6 months. Delivery CSVs: hz 287 MB, sh 228 MB, cq 145 MB, yt 32 MB, jl 4.7 MB. Pickup CSVs up to 335 MB; trajectory .pkl.xz 438 MB (skipped, >400 MB).
- Status: PARTIAL. Only `raw/delivery_jl.csv` (Jilin sample, 4.7 MB) downloaded. Others are public, no login: `https://huggingface.co/datasets/Cainiao-AI/LaDe/resolve/main/delivery/<file>.csv`.
- Columns (delivery): order_id, region_id, city, courier_id, lng, lat, aoi_id, aoi_type, accept_time, accept_gps_*, delivery_time, delivery_gps_*, ds.
- Mapping: order_date~accept_time, city, lat/lng and aoi_type (area-type proxy), courier. Outcome: completed deliveries only; time-to-deliver is a delay proxy.
- Relevance: 1/5 for RTO. Useful only for geo/courier delivery-time features.
- Limitations: China; no value/payment/category; no failure label.
