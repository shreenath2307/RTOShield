# Parcel loss prediction in last-mile delivery: deep and non-deep approaches with insights from Explainable AI

**Citation:** Jan de Leeuw, Zaharah Bukhsh, Yingqian Zhang (2023). *Parcel loss prediction in last-mile delivery: deep and non-deep approaches with insights from Explainable AI*. arXiv preprint arXiv:2310.16602 (TU Eindhoven).

**URL:** https://arxiv.org/abs/2310.16602

**PDF:** `paper.pdf` in this folder (source: https://arxiv.org/pdf/2310.16602)

**Open access:** Yes, freely available without login (arXiv).

## Key findings
- Predicts parcel loss in last-mile delivery from product, customer and order information, using one year of Belgian shipments.
- Extreme class imbalance (very few parcels lost) is the core challenge; compares Data Balance + Supervised Learning (DBSL) with Deep Hybrid Ensemble Learning (DHEL).
- DHEL (feed-forward autoencoder + random forest) gave the best classification performance.
- Explainable AI feature attribution is used to turn predictions into insurance/business decisions.
- Frames prediction as an input to a cost decision (insure or not), the same structure as a risk-tiered intervention.

## Methods / datasets
DBSL (resampling + classical classifiers), DHEL (autoencoder + random forest), XAI; Belgian e-commerce shipment data, one year.

## How it applies to RTO Shield
- **trainer:** Handle imbalance carefully. Resampling distorts probabilities, so recalibrate after any rebalancing (see papers 06, 07).
- **policy:** Prediction feeds a cost decision, supporting expected-cost tiering rather than a fixed 0.5 cut.
- **scorer:** Per-order explanations (SHAP reason codes) should be exposed to ops reviewers in the manual-review tier.
