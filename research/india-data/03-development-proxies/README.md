# 03 - District/state income and development proxies (fairness audit)

Status: PARTIAL.

## Downloaded (raw/)
- `nfhs5_tejas360_NFHS-5-Districts.csv` (4.1 MB, long format: State, State-Code, District, Indicator, NFHS-5, NFHS-4, notes), `nfhs5_tejas360_NFHS-5-States.csv` (131 indicators, states/UTs), README, LICENSE. Repo: https://github.com/Tejas360/NFHS-5 (CC-BY-4.0; data originally IIPS/MoHFW NFHS-5 2019-21 factsheets). Covers only 341 of ~707 districts (21 states) - incomplete. Full official: data.gov.in catalog "NFHS-5 India Districts Factsheet Data" https://data.gov.in/catalog/national-family-health-survey-5-nfhs-5-india-districts-factsheet-data (NDSAP/GODL) and IIPS http://rchiips.org/nfhs/factsheet_NFHS-5.shtml (per-district PDFs).
- Useful indicators: #7 electricity, #9 improved sanitation, #10 clean cooking fuel, #12 health insurance, #14 women literate. NFHS wealth quintile needs DHS microdata registration (https://dhsprogram.com) - not done.

## Not downloaded - how to get
- RBI Handbook of Statistics on Indian States 2024-25 (released 11-Dec-2025): Table 9 per-capita NSDP current prices https://rbidocs.rbi.org.in/rdocs/Publications/PDFs/09T_2908202582956A1D380840F5870B18841EEEF815.PDF ; Table 10 constant prices https://rbidocs.rbi.org.in/rdocs/Publications/PDFs/10T_290820257B1763CF72624007ABF4F4E48CC941B3.PDF ; landing https://website.rbi.org.in/web/rbi/-/publications/handbook-of-statistics-on-indian-states-2025 . Automated fetch hit an RBI CAPTCHA, NOT bypassed; download in a browser (free, no login) into raw/.
- Night lights: VIIRS annual composites (Colorado School of Mines EOG; free registration). SHRUG (Development Data Lab, https://www.devdatalab.org/shrug) bundles Census + nightlights + SECC at district level, free with registration/terms. Not downloaded.
- SECC 2011: https://secc.gov.in - portal reports only; SHRUG is the practical route.

## How to use
- `district_dev_index` = mean z-score of (clean fuel, electricity, sanitation, women literacy, insurance) from NFHS-5; fall back to state per-capita NSDP where the district is missing. Map to `income_band` via terciles.
- Fairness audit: use the index ONLY to measure disparity (flag-rate, FPR/FNR parity by band) after scoring - never as a model feature. If the pincode RTO prior correlates strongly with the index, audit and cap its weight.
