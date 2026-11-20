# A Dataset for Learning Graph Representations to Predict Customer Returns in Fashion Retail

**Citation:** Jamie McGowan, Elizabeth Guest, Ziyang Yan, Cong Zheng, Neha Patel, Mason Cusack, Charlie Donaldson, Sofie de Cnudde, Gabriel Facini, Fabon Dzogang (2023). *A Dataset for Learning Graph Representations to Predict Customer Returns in Fashion Retail*. arXiv preprint arXiv:2302.14096 (ASOS / UCL).

**URL:** https://arxiv.org/abs/2302.14096

**PDF:** `paper.pdf` in this folder (source: https://arxiv.org/pdf/2302.14096)

**Open access:** Yes, freely available without login (arXiv).

## Key findings
- Releases ASOS GraphReturns, a public dataset of customer/product/order interactions for return prediction.
- Reports a GNN reaching F1 0.792 on return classification, beating baseline models without a representation-learning step.
- The graph model also gives lower cross-entropy loss, suggesting more robust probabilities.
- Statistical exploration of the data motivates relational (customer-product) structure.
- Provides a reusable public benchmark for return prediction, useful for testing pipelines when real RTO data is private.

## Methods / datasets
Graph representation learning (GNN) vs baseline classifiers on the ASOS GraphReturns dataset; metrics F1 and cross-entropy.

## How it applies to RTO Shield
- **features:** Relational signals (customer-product-pincode history) can be summarised as leakage-safe aggregates; a GNN is not needed for v1 but neighbour-style features (pincode, courier lane) approximate it cheaply.
- **trainer:** Use as a public benchmark to exercise the training/calibration pipeline end to end; note it tracks cross-entropy, not only F1.
- **drift:** Can be used to rehearse time-based splits and PSI checks.
