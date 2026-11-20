# Instance-Dependent Cost-Sensitive Learning for Detecting Transfer Fraud

**Citation:** Sebastiaan Hoppner, Bart Baesens, Wouter Verbeke, Tim Verdonck (2020). *Instance-Dependent Cost-Sensitive Learning for Detecting Transfer Fraud*. arXiv preprint arXiv:2005.02488 [stat.AP].

**URL:** https://arxiv.org/abs/2005.02488

**PDF:** `paper.pdf` in this folder (source: https://arxiv.org/pdf/2005.02488)

**Open access:** Yes, freely available without login (arXiv).

## Key findings
- Fraud detection is an instance-dependent cost-sensitive problem: misclassification costs vary per transaction.
- Derives an instance-dependent decision threshold from the cost matrix for optimal cost-based decisions.
- Proposes cslogit (lasso logistic regression) and csboost (gradient tree boosting) that directly minimise the instance-dependent cost.
- Compared against state-of-the-art on a public Kaggle dataset and a proprietary card-transaction dataset; shows potential to reduce fraud losses.
- Argues that AUC/likelihood ignore the real business objective, which is financial loss.

## Methods / datasets
Cost-sensitive logistic regression and gradient tree boosting (R packages cslogit, csboost); Kaggle + proprietary data; savings-based evaluation.

## How it applies to RTO Shield
- **policy:** Per-order threshold p* = intervention cost / loss avoided, rather than a global cutoff; order value, shipping and margin differ per order.
- **trainer:** Option: custom cost-weighted LightGBM objective or sample weights by order value; evaluate by net savings.
- **impact:** Report savings in rupees, not only AUC.
