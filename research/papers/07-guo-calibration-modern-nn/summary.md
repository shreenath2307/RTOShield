# On Calibration of Modern Neural Networks

**Citation:** Chuan Guo, Geoff Pleiss, Yu Sun, Kilian Q. Weinberger (2017). *On Calibration of Modern Neural Networks*. Proc. 34th ICML, PMLR 70:1321-1330 (arXiv:1706.04599).

**URL:** https://arxiv.org/abs/1706.04599

**PDF:** `paper.pdf` in this folder (source: https://arxiv.org/pdf/1706.04599)

**Open access:** Yes, freely available without login (arXiv).

## Key findings
- Modern deep nets are poorly calibrated (overconfident) even when accurate.
- Uses Expected Calibration Error (ECE) and reliability diagrams as standard measures.
- Depth, width, weight decay and Batch Normalization influence calibration.
- Temperature scaling, a single-parameter variant of Platt scaling, is surprisingly effective and cheap.
- Compares histogram binning, isotonic regression and Platt-style post-processing.

## Methods / datasets
Image and document classification benchmarks; post-hoc calibration comparison with ECE, MCE, NLL.

## How it applies to RTO Shield
- **trainer:** Adopt ECE and reliability diagrams as calibration gates; keep the calibrator low-parameter when calibration data is small.
- **drift:** Track ECE over time on newly matured outcomes; recalibrate when it degrades even if AUC holds.
