# The Measure and Mismeasure of Fairness

**Citation:** Sam Corbett-Davies, Johann D. Gaebler, Hamed Nilforoshan, Ravi Shroff, Sharad Goel (2023). *The Measure and Mismeasure of Fairness*. Journal of Machine Learning Research 24(312):1-117 (arXiv:1808.00023 v3).

**URL:** https://arxiv.org/abs/1808.00023

**PDF:** `paper.pdf` in this folder (source: https://arxiv.org/pdf/1808.00023)

**Open access:** Yes, freely available without login (arXiv).

## Key findings
- Sorts fairness definitions into two families: constraining effects of decisions on disparities, and constraining the effect of protected characteristics on decisions.
- Both families typically yield strongly Pareto-dominated decision policies; they can harm the groups they were designed to protect.
- Dropping protected attributes (anticlassification) is insufficient when proxies such as location carry the signal.
- Argues for modelling the costs and benefits of decisions explicitly instead of axiomatic parity.
- Analytical and empirical demonstrations, e.g. in college admissions.

## Methods / datasets
Conceptual and analytical treatment with empirical illustrations.

## How it applies to RTO Shield
- **fairness:** Pincode and region are proxies for caste, religion, income; blindness to protected attributes does not prevent redlining. Audit outcomes (who gets blocked or gets friction) and document the cost-benefit rationale.
- **policy:** Use a single risk-based threshold from costs and weigh the harm of the intervention (friction vs denial). Favor soft interventions (confirmation) over COD denial for uncertain pincodes.
