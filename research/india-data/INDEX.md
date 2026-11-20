# India public data for RTO Shield - index (compiled 2026-11-20)

| # | Folder | Source / publisher | License | Status | Use |
|---|---|---|---|---|---|
| 01 | 01-pincode-directory | India Post pincode directory via data.gov.in (+ MIT GitHub mirror with lat/long) | GODL-India | Downloaded (154k + 157k rows, ~19.3k pincodes) | pincode -> district/state/lat/lng master |
| 02 | 02-city-tier-census | DoE HRA X/Y/Z city list (OM 21-07-2015); Census 2011 district (HF derived mirror) | Govt order; CC-BY-4.0 mirror | Partial (HRA as HTML; Census 640 districts, no urban share) | tier + literacy/workforce |
| 03 | 03-development-proxies | NFHS-5 district factsheets (GitHub mirror, 341 districts); RBI per-capita NSDP; SHRUG/VIIRS | CC-BY-4.0 mirror / GODL / RBI | Partial; RBI blocked by CAPTCHA, SHRUG/VIIRS need registration | fairness-audit income bands |
| 04 | 04-rto-industry-figures | ClickPost, Base, Razorpay, Unicommerce pages; Shadowfax 3PL report PDF | publishers' copyright | Saved pages + 1 PDF; Delhivery DRHP / Meesho RHP not downloaded | benchmark priors |
| 05 | 05-calendars-monsoon | IMD monsoon 2026 report; sale dates; festival CSV | Govt public / press | Partial (festival dates need verification) | seasonality / drift |

## Real RTO benchmark figures
Caveat: there is no official national RTO rate. Definitions differ (RTO vs failed delivery vs return); vendor figures are directional.

**COD vs prepaid**
- ClickPost network, FY2026, D2C brands with 1,000+ COD orders: COD RTO 37.51%, prepaid 5.28% (7.1x). https://www.clickpost.ai/blog/ecommerce-rto-statistics-india
- Meesho prospectus (RHP), failed/undelivered: FY25 COD 22.30% (delivery success 77.70%), prepaid 2.72%; H1 FY26 COD 24.15%, prepaid 3.61% (derived; via https://www.clickpost.ai/blog/cash-on-delivery-statistics-india). Primary: Meesho RHP.
- Qikink (print-on-demand), 2026: COD 30.1%, prepaid 1.5% (ClickPost page).
- Razorpay blog (mostly unsourced): COD RTO 25-30%, prepaid 2-3%; fashion COD can exceed 35-40%; >Rs 20,000 crore annual loss (unverified); 60-65% of orders COD (ET Prime Research, 2024). https://razorpay.com/blog/cash-on-delivery/
- Delhivery (2024 statement on Ecom Express DRHP; Inc42 / Business Standard): industry-average RTO ~14-18%.
- Unicommerce D2C report Apr 2026: COD order return rate 58% vs prepaid <15% in a festive quarter (sample unclear). https://unicommerce.com/india-d2c-report-2026-april/
- Base.com 2026 (methodology not stated, low confidence): COD return multiple vs prepaid 1.8-2.3x; blended return rate 25-30%; fraudulent COD 3-5% of COD.

**By city tier** (ClickPost, 35.8M orders, Oct-Nov 2025, all payment modes): Metro 6.60%, Tier 1 8.10%, Tier 2 11.50%, Tier 3+ 12.00%. COD-heavy brands FY2026: Tier-3 pincodes 23.73% vs metros 10.92%. Prepaid share 2025: metro 46%, Tier 2 40%, Tier 3 34.5%. Diwali 2025: Tier 3 = 50.7% of orders, COD = 52% of Tier-3 orders (YourStory via ClickPost). Base.com (low confidence): Tier 2/3 = 65-70% of COD orders and 72-75% of COD non-delivery attempts. Redseer FY25: Tier 2+ ~44% of e-commerce; penetration ~4% vs ~14% in top-8/Tier 1.

**By region**: no state-level RTO rates are published. Only merchantdata.in (Nov 2026): share of D2C stores advertising COD: all India >=30.2%, outside south 35.3%, five southern states 25.1%; Surat 46.4%, Jaipur 38.6%, Hyderabad 25.6%, Chennai 22.2%, Madurai 15.4%.

**By category** (ClickPost FY2026 COD RTO bands): fashion 21-32%, health/wellness 18-29%, beauty 18-27%, home/lifestyle 16-25%. Base.com COD return rates (low confidence): fashion 25-40%, footwear 20-30%, beauty 18-22%, home 15-20%, electronics 10-15%, health 8-12%, FMCG/books 3-6%.

**COD share of platform orders**: Meesho 88.71% (FY23), 85.39% (FY24), 76.95% (FY25), 72.00% (H1 FY26), ~63% (Q1 FY27); Shadowfax 47.00% (FY23), 44.44% (FY24), 36.13% (FY25), 34.46% (H1 FY26). Prepaid share of D2C orders 41% in 2025 vs 32% in 2024 (ClickPost, 635M orders).

**Seasonality**: D2C RTO ~39% in Nov 2025 (festive peak) vs ~21% in Feb 2026 (Unicommerce/Shipway via Business Standard); one brand 39.2% Nov 2025 -> 25.6% Jan 2026 -> 21.0% Mar 2026 (Unicommerce report). Festive return spike 35-45% (Base.com, low confidence).

**Other**: first-order RTO ~29% vs ~22% by orders 6-10 (ClickPost); RTO causes (share of RTOs): COD refusal 28-38%, address failure 18-26%, buyer unreachable 14-20%, fake orders 6-12%, carrier failure 5-10%; 97% of RTOs start with a failed attempt; orders with 1 / 2 / 3+ NDRs end as RTO 20.2% / 45.5% / 88.5%; loaded cost per RTO ~Rs 350 (285-490) at Rs 1,200 AOV; Rs 545 crore of goods returned as RTO in Oct-Nov 2025. Vendor claim: GoKwik / Pepe Jeans -40% RTO.

## Recommendation: rebuilding pincode_benchmarks.csv from real data
1. Skeleton: build the pincode master from 01 (median lat/long, district, state) in place of the hand-typed prefix rows; keep 3-digit `pincode_prefix` rows as the fallback level. Add tier from 02 (HRA X/Y/Z of the pincode's city; Z by default).
2. Priors: no public pincode-level RTO exists. Use a hierarchical prior: COD RTO by tier from ClickPost (metro ~11%, Tier 3 ~24% for COD-heavy brands; prepaid ~3-6%), scaled by the merchant's category band.
3. Shrinkage: benchmark = (n * observed + k * prior) / (n + k), k ~ 30-50 orders; fall back pincode -> 3-digit prefix -> district -> tier. Store k in `pseudo_count` and mark rows source=prior.
4. Replace with real merchant outcomes as they accrue. For further public validation, get the Meesho RHP and Delhivery DRHP (see 04) and mine the Shadowfax 3PL PDF.
5. Add season multipliers (festive peak vs off-peak roughly 1.5-1.8x per Unicommerce) from 05.
6. Fairness: keep `income_band` from 03 audit-only; report parity by income band and tier; cap prefix/pincode prior influence if it proxies income.
