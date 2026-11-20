# Data models for service failure prediction in supply-chain networks

**Citation:** Monika Sharma, Tristan Glatard, Eric Gelinas, Mariam Tagmouti, Brigitte Jaumard (2018). *Data models for service failure prediction in supply-chain networks*. arXiv preprint arXiv:1810.09944 (Concordia Univ. / ClearDestination).

**URL:** https://arxiv.org/abs/1810.09944

**PDF:** `paper.pdf` in this folder (source: https://arxiv.org/pdf/1810.09944)

**Open access:** Yes, freely available without login (arXiv).

## Key findings
- Predicts and explains service failures (customer not home, rescheduled, refused/cancelled) on about 500,000 last-mile pickup/delivery services.
- Random Forest reaches average sensitivity 0.7 and specificity 0.7 across 5 failure types.
- Association rules reassert that confirmation calls prevent not-at-home failures, direct support for a WhatsApp confirmation intervention.
- Time-window size, slack time and customer geographic location are strong failure predictors, as is the retailer.
- Suggests coupling predictions to countermeasures by human dispatchers or optimisers.

## Methods / datasets
Random Forest classification and association-rule mining on a proprietary Canadian dataset of 500K services.

## How it applies to RTO Shield
- **policy:** Evidence that confirmation contact prevents failures; justifies the confirmation tier and its A/B test.
- **features:** Geography (pincode/region), time-window and retailer/merchant identity are useful features; geography also needs the fairness audit.
- **fairness:** Location as a top predictor is exactly the redlining risk; audit outcomes by region.
