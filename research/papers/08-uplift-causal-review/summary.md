# Causal Inference and Uplift Modeling: A Review of the Literature

**Citation:** Pierre Gutierrez, Jean-Yves Gerardy (2017). *Causal Inference and Uplift Modeling: A Review of the Literature*. Proc. Machine Learning Research (JMLR W&CP) 67:1-13, KDD 2016 Workshop on Causal Inference and Uplift Modeling.

**URL:** https://proceedings.mlr.press/v67/gutierrez17a.html

**PDF:** `paper.pdf` in this folder (source: https://proceedings.mlr.press/v67/gutierrez17a/gutierrez17a.pdf)

**Open access:** Yes, freely available without login (PMLR open proceedings).

## Key findings
- Uplift is the incremental effect of an action on an individual outcome; a causal inference problem, not just prediction.
- Three families: Two-Model (treatment/control), Class Transformation, and direct uplift modelling.
- Uses Rubin's potential-outcomes framework to compare the approaches in common notation.
- Shows that minimising MSE against the causal effect is equivalent in the limit to minimising MSE against a modified target variable.
- Needs randomised treatment/control data; a holdout is the prerequisite.

## Methods / datasets
Literature review with unified Rubin-model notation; no new experiments.

## How it applies to RTO Shield
- **impact:** A randomised holdout gives the ATE and enables later uplift models. Measure incremental RTO avoided, not just RTO among contacted orders.
- **policy:** Target persuadables, not only high-risk orders: high risk with zero uplift wastes WhatsApp/review cost. Start with a two-model approach once holdout data exists.
