# Failing Loudly: An Empirical Study of Methods for Detecting Dataset Shift

**Citation:** Stephan Rabanser, Stephan Gunnemann, Zachary C. Lipton (2019). *Failing Loudly: An Empirical Study of Methods for Detecting Dataset Shift*. Advances in Neural Information Processing Systems 32 (NeurIPS 2019); arXiv:1810.11953.

**URL:** https://arxiv.org/abs/1810.11953

**PDF:** `paper.pdf` in this folder (source: https://arxiv.org/pdf/1810.11953)

**Open access:** Yes, freely available without login (arXiv).

## Key findings
- ML systems fail silently under shift; the paper studies detecting shift, characterising it and judging its malignancy.
- Best approach found: two-sample testing on dimensionality-reduced inputs using pre-trained classifiers.
- Domain-discriminating approaches help characterise shift qualitatively and determine whether it is harmful.
- Covers covariate, label and combined shifts at varying magnitudes and fractions of data affected.
- Gives a practical case for monitoring with statistical tests rather than ad-hoc eyeballing.

## Methods / datasets
Empirical benchmark across image/text datasets with synthetic shifts; two-sample tests and classifier-based dimensionality reduction.

## How it applies to RTO Shield
- **drift:** PSI is a reasonable univariate monitor; complement with per-feature two-sample tests (KS) plus multiple-testing correction, and a domain classifier on the score distribution.
- **drift:** Distinguish label shift (RTO rate moves, e.g. festive season) from covariate shift (new regions/channels) before triggering retraining.
