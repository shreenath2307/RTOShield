# RTO Shield: Research Papers Index

All 12 papers are open access. PDFs sit in each paper's folder as `paper.pdf`; each folder has a `summary.md`. Papers 01-05 are directly about e-commerce returns, order-return or delivery-failure prediction (01 is from Myntra, India). No open paper specifically on Indian COD RTO prediction was found; only vendor blog posts (Delhivery, Razorpay, Cashfree), which are not included.

| # | Title | Authors | Year | Venue | Topic | Relevance |
|---|---|---|---|---|---|---|
| 01 | [Early Bird Catches the Worm: Predicting Returns Even Before Purchase in Fashion E-commerce](01-early-bird-myntra-returns/summary.md) | Sajan Kedia, Manchit Madan, Sumit Borar | 2019 | arXiv preprint arXiv:1906.12128 | Pre-order return prediction (India) | Very high |
| 02 | [A Dataset for Learning Graph Representations to Predict Customer Returns in Fashion Retail](02-asos-return-graph-dataset/summary.md) | Jamie McGowan et al. | 2023 | arXiv preprint arXiv:2302.14096 | Return prediction, graph dataset | Medium |
| 03 | [Parcel loss prediction in last-mile delivery: deep and non-deep approaches with insights from Explainable AI](03-parcel-loss-last-mile/summary.md) | Jan de Leeuw, Zaharah Bukhsh, Yingqian Zhang | 2023 | arXiv preprint arXiv:2310.16602 | Delivery-failure prediction, imbalance, XAI | High |
| 04 | [Data models for service failure prediction in supply-chain networks](04-service-failure-prediction/summary.md) | Monika Sharma et al. | 2018 | arXiv preprint arXiv:1810.09944 | Last-mile delivery failure prediction | High |
| 05 | [Learning Reasons for Product Returns on E-Commerce](05-learning-return-reasons/summary.md) | Miriam Farber, Slava Novgorodov, Ido Guy | 2024 | Proc. 7th Workshop on e-Commerce and NLP | Return likelihood and reason prediction | Medium |
| 06 | [Predicting Good Probabilities With Supervised Learning](06-niculescu-mizil-calibration/summary.md) | Alexandru Niculescu-Mizil, Rich Caruana | 2005 | Proc. 22nd International Conference on Machine Learning | Probability calibration (Platt, isotonic) | Very high |
| 07 | [On Calibration of Modern Neural Networks](07-guo-calibration-modern-nn/summary.md) | Chuan Guo et al. | 2017 | Proc. 34th ICML, PMLR 70:1321-1330 | Calibration, ECE, temperature scaling | High |
| 08 | [Causal Inference and Uplift Modeling: A Review of the Literature](08-uplift-causal-review/summary.md) | Pierre Gutierrez, Jean-Yves Gerardy | 2017 | Proc. Machine Learning Research | Uplift modelling / causal measurement | High |
| 09 | [Failing Loudly: An Empirical Study of Methods for Detecting Dataset Shift](09-failing-loudly-drift/summary.md) | Stephan Rabanser, Stephan Gunnemann, Zachary C. Lipton | 2019 | Advances in Neural Information Processing Systems 32 | Dataset shift / drift detection | High |
| 10 | [Equality of Opportunity in Supervised Learning](10-equality-of-opportunity/summary.md) | Moritz Hardt, Eric Price, Nathan Srebro | 2016 | Advances in Neural Information Processing Systems 29 | Fairness criteria, post-processing | High |
| 11 | [The Measure and Mismeasure of Fairness](11-measure-mismeasure-fairness/summary.md) | Sam Corbett-Davies et al. | 2023 | Journal of Machine Learning Research 24(312):1-117 | Fairness definitions, proxies, tradeoffs | High |
| 12 | [Instance-Dependent Cost-Sensitive Learning for Detecting Transfer Fraud](12-instance-cost-sensitive-fraud/summary.md) | Sebastiaan Hoppner et al. | 2020 | arXiv preprint arXiv:2005.02488 [stat.AP] | Fraud scoring, cost-sensitive gradient boosting | High |

## Design implications

- **Features (leakage-safe, time-based):** Lifetime product/customer return rates, payment type, cart size and geography are the strongest return/failure predictors (01, 04). Compute them only from data matured before the order timestamp. Sparse pincodes need smoothed rates (empirical Bayes); relational aggregates approximate graph signals (02).
- **Trainer:** Gradient boosting is a strong baseline (01: GBM AUC 71.6 rising to about 80 with feature engineering). With heavy imbalance (03), resampling or weighting distorts probabilities, so always recalibrate. Optionally use order-value-weighted or cost-sensitive objectives (12).
- **Calibration:** Boosted trees are systematically miscalibrated (06). Fit Platt (small data) or isotonic (large data) on a later time slice; gate releases on Brier, ECE and reliability curves (07).
- **Scorer / cold start:** Return calibrated probabilities with SHAP reason codes (03) for reviewers; regional benchmarks fill cold-start pincodes, with the weight shrinking as data accrues.
- **Policy (cost-sensitive tiers):** Per-order expected-cost thresholds (12) and probability bands (01: High/Medium/Low, thresholds from the precision-recall curve). Confirmation contact has evidence of reducing not-at-home failures (04); COD restriction and prepaid-style levers appear in 01. Reason-aware routing (05): address problems get WhatsApp confirmation, intent problems get a prepaid nudge.
- **Impact (A/B holdout, uplift):** A randomised holdout is mandatory for causal claims (08). Report incremental RTO avoided, order loss and net rupees (01: returns -3% vs orders -1.7%). Later move from risk targeting to uplift to target persuadable orders.
- **Drift and retraining:** PSI per feature as a cheap monitor, backed by two-sample tests with multiple-testing correction and a domain classifier (09); separate label shift (seasonal RTO rate) from covariate shift; monitor ECE on matured outcomes (07); retrain/recalibrate on trigger.
- **Fairness (anti-redlining):** Geography is a top predictor (04) and a proxy for protected groups (11), so removing protected attributes is insufficient. Audit error rates and intervention burden per region (10), report per-region calibration, prefer low-friction interventions (confirmation) over denying COD, and document the cost-benefit rationale (11).

## BibTeX

```bibtex
@misc{kedia2019early,
  title = {Early Bird Catches the Worm: Predicting Returns Even Before Purchase in Fashion E-commerce},
  author = {Kedia, S. and Madan, M. and Borar, S.},
  year = {2019},
  howpublished = {arXiv preprint arXiv:1906.12128 (Myntra, India)},
  url = {https://arxiv.org/abs/1906.12128}
}

@misc{mcgowan2023asos,
  title = {A Dataset for Learning Graph Representations to Predict Customer Returns in Fashion Retail},
  author = {McGowan, J. and Guest, E. and Yan, Z. and Zheng, C. and Patel, N. and Cusack, M. and Donaldson, C. and de Cnudde, S. and Facini, G. and Dzogang, F.},
  year = {2023},
  howpublished = {arXiv preprint arXiv:2302.14096 (ASOS / UCL)},
  url = {https://arxiv.org/abs/2302.14096}
}

@misc{deleeuw2023parcel,
  title = {Parcel loss prediction in last-mile delivery: deep and non-deep approaches with insights from Explainable AI},
  author = {de Leeuw, J. and Bukhsh, Z. and Zhang, Y.},
  year = {2023},
  howpublished = {arXiv preprint arXiv:2310.16602 (TU Eindhoven)},
  url = {https://arxiv.org/abs/2310.16602}
}

@misc{sharma2018service,
  title = {Data models for service failure prediction in supply-chain networks},
  author = {Sharma, M. and Glatard, T. and G{\'e}linas, {\'E}. and Tagmouti, M. and Jaumard, B.},
  year = {2018},
  howpublished = {arXiv preprint arXiv:1810.09944 (Concordia Univ. / ClearDestination)},
  url = {https://arxiv.org/abs/1810.09944}
}

@misc{farber2024returns,
  title = {Learning Reasons for Product Returns on E-Commerce},
  author = {Farber, M. and Novgorodov, S. and Guy, I.},
  year = {2024},
  howpublished = {Proc. 7th Workshop on e-Commerce and NLP (ECNLP) at LREC-COLING 2024, pp. 1-7, ELRA/ICCL},
  url = {https://aclanthology.org/2024.ecnlp-1.1}
}

@misc{niculescu2005predicting,
  title = {Predicting Good Probabilities With Supervised Learning},
  author = {Niculescu-Mizil, A. and Caruana, R.},
  year = {2005},
  howpublished = {Proc. 22nd International Conference on Machine Learning (ICML), pp. 625-632},
  url = {https://www.cs.cornell.edu/~alexn/papers/calibration.icml05.crc.rev3.pdf}
}

@misc{guo2017calibration,
  title = {On Calibration of Modern Neural Networks},
  author = {Guo, C. and Pleiss, G. and Sun, Y. and Weinberger, K. Q.},
  year = {2017},
  howpublished = {Proc. 34th ICML, PMLR 70:1321-1330 (arXiv:1706.04599)},
  url = {https://arxiv.org/abs/1706.04599}
}

@misc{gutierrez2017causal,
  title = {Causal Inference and Uplift Modeling: A Review of the Literature},
  author = {Gutierrez, P. and G{\'e}rardy, J.-Y.},
  year = {2017},
  howpublished = {Proc. Machine Learning Research (JMLR W&CP) 67:1-13, KDD 2016 Workshop on Causal Inference and Uplift Modeling},
  url = {https://proceedings.mlr.press/v67/gutierrez17a.html}
}

@misc{rabanser2019failing,
  title = {Failing Loudly: An Empirical Study of Methods for Detecting Dataset Shift},
  author = {Rabanser, S. and G{\"u}nnemann, S. and Lipton, Z. C.},
  year = {2019},
  howpublished = {Advances in Neural Information Processing Systems 32 (NeurIPS 2019); arXiv:1810.11953},
  url = {https://arxiv.org/abs/1810.11953}
}

@misc{hardt2016equality,
  title = {Equality of Opportunity in Supervised Learning},
  author = {Hardt, M. and Price, E. and Srebro, N.},
  year = {2016},
  howpublished = {Advances in Neural Information Processing Systems 29 (NIPS 2016); arXiv:1610.02413},
  url = {https://arxiv.org/abs/1610.02413}
}

@misc{corbettdavies2023measure,
  title = {The Measure and Mismeasure of Fairness},
  author = {Corbett-Davies, S. and Gaebler, J. D. and Nilforoshan, H. and Shroff, R. and Goel, S.},
  year = {2023},
  howpublished = {Journal of Machine Learning Research 24(312):1-117 (arXiv:1808.00023 v3)},
  url = {https://arxiv.org/abs/1808.00023}
}

@misc{hoppner2020instance,
  title = {Instance-Dependent Cost-Sensitive Learning for Detecting Transfer Fraud},
  author = {H{\"o}ppner, S. and Baesens, B. and Verbeke, W. and Verdonck, T.},
  year = {2020},
  howpublished = {arXiv preprint arXiv:2005.02488 [stat.AP]},
  url = {https://arxiv.org/abs/2005.02488}
}

```
