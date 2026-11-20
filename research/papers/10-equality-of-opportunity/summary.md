# Equality of Opportunity in Supervised Learning

**Citation:** Moritz Hardt, Eric Price, Nathan Srebro (2016). *Equality of Opportunity in Supervised Learning*. Advances in Neural Information Processing Systems 29 (NIPS 2016); arXiv:1610.02413.

**URL:** https://arxiv.org/abs/1610.02413

**PDF:** `paper.pdf` in this folder (source: https://arxiv.org/pdf/1610.02413)

**Open access:** Yes, freely available without login (arXiv).

## Key findings
- Proposes a criterion for discrimination against a sensitive attribute (equalized odds / equal opportunity).
- Shows how to optimally adjust any learned predictor to satisfy the criterion (post-processing, group-specific thresholds).
- The notion is oblivious: depends only on joint statistics of predictor, target and group.
- Shifts the cost of poor classification from disadvantaged groups to the decision maker.
- Illustrated with a FICO credit score case study.

## Methods / datasets
Theory plus FICO credit-score case study.

## How it applies to RTO Shield
- **fairness:** Audit per-region error rates (e.g. false-flag rate on orders that would have been delivered), not just flag rates.
- **policy:** If an audit finds disparity, group-aware thresholds or capped per-region intervention rates are a post-processing remedy; weigh against legal and business constraints.
