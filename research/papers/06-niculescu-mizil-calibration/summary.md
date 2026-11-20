# Predicting Good Probabilities With Supervised Learning

**Citation:** Alexandru Niculescu-Mizil, Rich Caruana (2005). *Predicting Good Probabilities With Supervised Learning*. Proc. 22nd International Conference on Machine Learning (ICML), pp. 625-632.

**URL:** https://www.cs.cornell.edu/~alexn/papers/calibration.icml05.crc.rev3.pdf

**PDF:** `paper.pdf` in this folder (source: https://www.cs.cornell.edu/~alexn/papers/calibration.icml05.crc.rev3.pdf)

**Open access:** Yes, freely available without login (author-hosted PDF).

## Key findings
- Boosted trees and stumps push predicted probabilities away from 0 and 1, giving a sigmoid-shaped distortion.
- Naive Bayes pushes probabilities toward 0 and 1; neural nets and bagged trees are naturally well calibrated.
- Platt scaling and isotonic regression both correct the distortion; Platt suits sigmoid-shaped bias and small data, isotonic is more flexible but needs more data.
- After calibration, boosted trees, random forests and SVMs predict the best probabilities across ten algorithms.
- Calibration must use a held-out set separate from training.

## Methods / datasets
Empirical comparison of 10 supervised learners on several binary datasets, with reliability diagrams and squared error, cross-entropy and ROC metrics.

## How it applies to RTO Shield
- **trainer:** Gradient boosting is miscalibrated by default; fit Platt (small sets) or isotonic (large sets) on a later, time-ordered held-out slice, never on training rows.
- **scorer:** Calibrated probabilities are needed for expected-cost thresholds; report Brier score and reliability curves.
