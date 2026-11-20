# Learning Reasons for Product Returns on E-Commerce

**Citation:** Miriam Farber, Slava Novgorodov, Ido Guy (2024). *Learning Reasons for Product Returns on E-Commerce*. Proc. 7th Workshop on e-Commerce and NLP (ECNLP) at LREC-COLING 2024, pp. 1-7, ELRA/ICCL.

**URL:** https://aclanthology.org/2024.ecnlp-1.1

**PDF:** `paper.pdf` in this folder (source: https://aclanthology.org/2024.ecnlp-1.1.pdf)

**Open access:** Yes, freely available without login (ACL Anthology).

## Key findings
- Presented as the first comprehensive study of product returns across multiple e-commerce domains.
- Notes return rates range from about 5% to 60% depending on category and policy.
- Proposes supervised prediction of both return likelihood and return reason (sizing, defect, no longer needed).
- Reasons differ by domain, so reason-aware actions are possible.
- Evaluated on a real dataset from a large e-commerce platform (Meta). Detailed results are in the PDF.

## Methods / datasets
Supervised classification over real platform data; short workshop paper (7 pages).

## How it applies to RTO Shield
- **features:** Segment by category/domain; a reason taxonomy (address wrong, customer unreachable, changed mind, COD refusal) can become auxiliary labels.
- **policy:** Different reasons imply different interventions: address-quality issues map to WhatsApp confirmation; intent issues map to prepaid nudge.
