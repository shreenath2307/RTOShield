# 01 - India Post All-India Pincode Directory

Status: DOWNLOADED (two files). Retrieved 2026-11-20.

## Files (raw/)
| File | Source | Rows | Notes |
|---|---|---|---|
| `all_india_pin_code.csv` (14.8 MB) | https://data.gov.in/sites/default/files/all_india_pin_code.csv (direct, no login) | 154,823 offices / 19,097 unique pincodes | Official OGD file, Dept of Posts. OLD snapshot: no lat/long, Telangana districts still under "ANDHRA PRADESH". Columns: officename, pincode, officeType, Deliverystatus, divisionname, regionname, circlename, Taluk, Districtname, statename |
| `pincode_mirror_dropdevrahul.csv` (23.8 MB) | https://github.com/dropdevrahul/pincodes-india (MIT, unofficial mirror of the data.gov.in directory) | 157,126 offices / 19,300 unique pincodes; 148,288 rows with lat/long | Columns: CircleName, RegionName, DivisionName, OfficeName, Pincode, OfficeType, Delivery, District, StateName, Latitude, Longitude. Newer, has coordinates. Lat/long is per post office with gaps/noise; take the median per pincode. |

## Publisher / license
India Post, Department of Posts, Ministry of Communications, via Open Government Data Platform India (data.gov.in). License: GODL-India (Government Open Data License - India). Mirror repo is MIT; underlying data is still GODL.
Other official pages: https://data.gov.in/resource/all-india-pincode-directory-till-last-month (monthly; API download needs a free data.gov.in API key - registration, not done) and https://data.gov.in/catalog/all-india-pincode-directory-through-webservice. AIKosh: https://aikosh.indiaai.gov.in/home/datasets/details/all_india_pincode_directory_till_last_month_1.html (not downloaded; may need login).

## How to use in RTO Shield
- Use the mirror file; group by `Pincode`, take median Latitude/Longitude and mode of District/StateName -> clean pincode master (~19.3k pincodes) replacing the hand-typed prefix rows in pincode_benchmarks.csv.
- Join on the full 6-digit pincode (preferred) or the first 3 digits (sorting-district prefix, coarse cold-start fallback) to get lat/long + district + state.
- `Delivery` vs `Non Delivery` office is a serviceability feature.
- District is the join key to census (02) and NFHS (03); normalise names (upper-case, strip "DISTRICT", handle renames e.g. Allahabad/Prayagraj).
- First pincode digit = postal zone (1 Delhi/Haryana/Punjab/HP/J&K ... 8 Bihar/Jharkhand), usable as a region feature.
