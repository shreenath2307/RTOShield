# 06 - Amazon Last Mile Routing Research Challenge (AWS Open Data)

- Source: https://registry.opendata.aws/amazon-last-mile-challenges ; bucket `s3://amazon-last-mile-challenges` (us-west-2), no AWS account: `aws s3 sync --no-sign-request s3://amazon-last-mile-challenges/almrrc2021/ .` or HTTPS `https://amazon-last-mile-challenges.s3.us-west-2.amazonaws.com/almrrc2021/...`
- License: CC BY-NC 4.0 (`raw/License.txt`). Paper: Merchan et al. 2022, Transportation Science, doi 10.1287/trsc.2022.1173.
- Size: 9,184 routes (US, 5 metros, 2018). Status: PARTIAL. Downloaded License.txt, Readme.txt, route_data.json (79 MB), package_data.json (375 MB, training set). Skipped travel_times.json (1.8 GB) and the evaluation set.
- Columns: route (station, date, departure time, capacity); stops/packages (scan_status, time_window, planned_service_time_seconds, dimensions, zone_id; stop coordinates are in route_data.json).
- Verified scan_status counts in training package_data: DELIVERED 1,446,129 / DELIVERY_ATTEMPTED 11,014 (0.76%) / REJECTED 32.

## Mapping
Only dataset here with per-package failed-attempt (DELIVERY_ATTEMPTED) and REJECTED statuses, plus time windows and package size: closest direct analogue of a failed-delivery label. No payment, value or customer.

## Relevance: 2/5
## Limitations
Non-commercial; no order-level business features; US; obfuscated geography; very few rejections.
