# Early Bird Catches the Worm: Predicting Returns Even Before Purchase in Fashion E-commerce

**Citation:** Sajan Kedia, Manchit Madan, Sumit Borar (2019). *Early Bird Catches the Worm: Predicting Returns Even Before Purchase in Fashion E-commerce*. arXiv preprint arXiv:1906.12128 (Myntra, India).

**URL:** https://arxiv.org/abs/1906.12128

**PDF:** `paper.pdf` in this folder (source: https://arxiv.org/pdf/1906.12128)

**Open access:** Yes, freely available without login (arXiv).

## Key findings
- Predicts return probability at the cart page, before order placement, so preemptive actions can be taken.
- GBM baseline on basic user/product features: AUC 71.6%; feature engineering +8 points; BPR product embeddings +1.8; final DNN with embeddings + engineered features: AUC 83.2%, precision 74%.
- Top features: product lifetime return rate, cart size, payment type, user lifetime returned quantity, price. Cart size >5 gives 72% return rate vs 9% for single-item carts.
- Probability goes through rule-based thresholds chosen from the precision-recall curve plus business logic (e.g. 0.77 for a delivery charge); High/Medium/Low segments each run as separate A/B tests.
- Live A/B (about 100K users): personalised delivery charge cut return % by 3% while orders fell 1.7%; 90% of churned users had high return probability. Non-returnable-with-coupon cut returns 4%; Try&Buy cut 3.7%.
- Payment-mode restriction (e.g. disabling Cash on Delivery) is listed as an action for high-risk carts.

## Methods / datasets
Dual model: DNN at cart level then gradient-boosted classifier at product level (250 trees, depth 7, lr 0.005). Matrix-factorisation BPR embeddings and skip-gram size vectors. Proprietary Myntra data.

## How it applies to RTO Shield
- **features:** Product/user lifetime return rate, payment type and cart size were the strongest signals. Build analogous pincode, product, customer history and payment-mode features.
- **policy:** Choose action thresholds from the precision-recall curve plus business cost, and tier users into High/Medium/Low segments. Same pattern as the WhatsApp/prepaid-nudge/manual-review tiers.
- **impact:** Shows the A/B design: the trade-off between order loss (-1.7%) and return reduction (-3%) must be measured jointly. Report both.
- **trainer:** A GBM baseline is competitive; use AUC and PR-AUC as reference and track gain per feature group.
