# 02 - City tier (HRA X/Y/Z) and Census 2011 district data

Status: PARTIAL - HRA list captured as saved HTML; Census district table from a derived mirror.

## Files (raw/)
- `hra_om_taxguru.html` - TaxGuru page reproducing Dept of Expenditure O.M. No. 2/5/2014-E.II(B) dated 21-07-2015 (HRA classification on Census 2011). Source: https://taxguru.in/?p=69041 . Annexure: X = Greater Mumbai, Delhi, Kolkata, Chennai, Bengaluru, Hyderabad, Pune, Ahmedabad; Y = state-wise list (Lucknow, Kanpur, Nagpur, Indore, Jaipur, ...); all else Z. Official index: https://doe.gov.in/orders-circulars/32 (original PDF not fetched; direct dpe.gov.in link 404). Later amendments exist (7th CPC O.M. 07-07-2017; 2018 Mathura-Vrindavan to Y). Government order, public.
- `census_2011_districts_final.parquet` + `hf_readme.md` - 640 districts x 29 columns from https://huggingface.co/datasets/indiaset/census-2011 (CC-BY-4.0; derived from Census of India 2011 PCA, total validated to 1,210,854,977). Columns: state_code, district_code, lgd_code, district_name(_lgd), pop_total/male/female, pop_under6, pop_sc, pop_st, literate_*, workers_*, literacy_rate, sex_ratio, workforce_participation. No urban/rural split.
- Official Census (not downloaded): Population Finder https://censusindia.gov.in/census.website/data/population-finder ; PCA tables incl. urban/rural https://censusindia.gov.in/nada/index.php/catalog/ (e.g. /catalog/42559). Use to compute `urban_pop_share` per district.

## How to use
- Tier: parse the Annexure to `city -> X/Y/Z`; map pincode -> city via district/office name. RTO Shield convention: X -> metro, Y -> tier-2, Z -> tier-3 (e-com tiers are informal; ClickPost uses Metro/Tier1/Tier2/Tier3, see 04).
- Census: join on LGD code or normalised district name via the pincode directory. Features: literacy_rate, sex_ratio, workforce_participation. SC/ST share: for the fairness AUDIT only, not a model input. Census 2011 is stale (640 vs ~780 districts) - slow-moving proxy only.
