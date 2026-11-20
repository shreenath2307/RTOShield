# 05 - Festival / sale calendar and monsoon (IMD)

Status: PARTIAL.

## Files
- `raw/imd_salient_features_monsoon_2026.pdf` (19 pp) - IMD "Salient Features of SW Monsoon 2026": onset Kerala 4 Jun (normal 1 Jun), all-India cover 9 Jul (normal 8 Jul), withdrawal start 19 Sep (normal 17 Sep); state/subdivision/district rainfall departures. https://mausam.imd.gov.in/Forecast/marquee_data/Salient_Features_SW_MONSOON%20_2026_30_sep.pdf . Govt of India / IMD public report (attribute IMD).
- `festival_calendar_2026.csv` - sale dates (Amazon/press) and monsoon markers; major festival dates are from model knowledge and flagged VERIFY - check against the Govt holiday list or a panchang.
- Not downloaded: IMD normal onset/withdrawal dates (revised 2020; https://mausamjournal.imd.gov.in/index.php/MAUSAM/article/view/33), annual reports (https://mausam.imd.gov.in/imd_latest/monsoon_report_2025_2.pdf), gridded/district rainfall via IMD Pune Data Supply Portal (https://dsp.imdpune.gov.in, free registration).

## How to use
- Features: `days_to_nearest_festival`, `is_mega_sale_window`, `monsoon_active` (state/subdivision, Jun-Sep).
- Evidence for seasonality: Unicommerce/Shipway D2C RTO ~39% (Nov 2025 festive peak) vs ~21% (Feb-Mar 2026); see ../INDEX.md.
- Drift: treat sale windows and monsoon months as known regimes so PSI/drift alerts do not misfire; keep per-season benchmark multipliers. Rebuild yearly (lunar festivals move).
