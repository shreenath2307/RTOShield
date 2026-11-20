/**
 * Research content for RTO Shield. Every fact below is taken from the project's
 * research notes (datasets, india-data, papers). Nothing here is measured on
 * RTO Shield's own data.
 */

export type DatasetStatus = "downloaded" | "partial" | "login required" | "not downloaded";

export type Dataset = {
  id: string;
  name: string;
  source: string;
  url: string;
  licence: string;
  size: string;
  status: DatasetStatus;
  /** 1 to 5 as rated in the notes; null where the notes give no rating. */
  relevance: number | null;
  offers: string;
  mapping: string;
  limitations: string;
};

export const DATASETS_GLOBAL: Dataset[] = [
  {
    id: "olist",
    name: "Olist Brazilian E-Commerce",
    source: "Olist (Kaggle); downloaded from a public Hugging Face mirror",
    url: "https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce",
    licence: "CC BY-NC-SA 4.0 (original; the mirror has no licence tag)",
    size: "~127 MB, 9 CSVs, ~100k orders (2016-2018)",
    status: "downloaded",
    relevance: 4,
    offers:
      "Real order-level data: order status (delivered 96,478, canceled 625, unavailable 609), payment type (credit_card 76,795, boleto 19,784), zip prefix, repeat customers, categories and timestamps.",
    mapping:
      "Boleto, an offline pay-later method, is the closest proxy to COD; credit card is prepaid. Canceled or unavailable maps to RTO-like, delivered to DELIVERED. The zip prefix stands in for the pincode and customer_unique_id gives repeat history.",
    limitations:
      "Brazil, BRL, 2016-18. No COD. Cancellations are not refusals. About 1% positive rate. Late delivery (~8%) is a different target. Non-commercial licence, so research and validation only.",
  },
  {
    id: "dataco",
    name: "DataCo Smart Supply Chain",
    source: "DataCo (Mendeley Data, DOI 10.17632/8gx2fvg2k6.5); downloaded from a Hugging Face mirror",
    url: "https://data.mendeley.com/datasets/8gx2fvg2k6/5",
    licence: "CC BY 4.0",
    size: "96 MB CSV, 180,519 rows x 53 columns",
    status: "downloaded",
    relevance: 3,
    offers:
      "A payment Type field (DEBIT, TRANSFER, PAYMENT, CASH 19,616), Order Status (CANCELED 3,692, SUSPECTED_FRAUD 4,062), categories, regions, order value and shipping dates.",
    mapping:
      "Type=CASH is used as the COD proxy and other types as prepaid. CANCELED, SUSPECTED_FRAUD and Shipping canceled map to RTO-like.",
    limitations:
      "The late label is leaky, so drop 'Days for shipping (real)' and 'Delivery Status'. Looks semi-synthetic. PII is masked, not India, no pincode signal, and CASH is a transaction type, not confirmed COD.",
  },
  {
    id: "uci-online-retail",
    name: "UCI Online Retail",
    source: "UCI Machine Learning Repository",
    url: "https://archive.ics.uci.edu/dataset/352/online+retail",
    licence: "CC BY 4.0",
    size: "23 MB zip, ~541,909 rows (UK retailer, 2010-11)",
    status: "downloaded",
    relevance: 2,
    offers: "Invoices with a cancellation prefix (C) and a customer ID, so repeat-customer and cancellation-rate history.",
    mapping: "A C-prefixed or negative-quantity invoice is treated as an RTO-like reversal. Used for repeat-customer and cancel-rate feature engineering only.",
    limitations: "No payment method, geography is country only, no delivery data, wholesale-heavy, and cancellations are not linked to the original invoice.",
  },
  {
    id: "uci-online-retail-ii",
    name: "UCI Online Retail II",
    source: "UCI Machine Learning Repository",
    url: "https://archive.ics.uci.edu/dataset/502/online+retail+ii",
    licence: "CC BY 4.0",
    size: "46 MB zip, ~1.07M rows, 2009-2011, UK",
    status: "downloaded",
    relevance: 2,
    offers: "A larger version of Online Retail with the same invoice, cancellation and customer fields, in two sheets.",
    mapping: "Same mapping as Online Retail. Used for repeat-customer and cancel-rate feature prototyping.",
    limitations: "No payment, no pincode, no delivery outcome, wholesale-heavy.",
  },
  {
    id: "amazon-last-mile",
    name: "Amazon Last Mile Routing Research Challenge",
    source: "Amazon via AWS Open Data (Merchan et al. 2022, Transportation Science)",
    url: "https://registry.opendata.aws/amazon-last-mile-challenges",
    licence: "CC BY-NC 4.0",
    size: "9,184 routes (US, 5 metros, 2018); 454 MB downloaded of a larger set",
    status: "partial",
    relevance: 2,
    offers:
      "The only set here with per-package failed-attempt statuses: DELIVERED 1,446,129, DELIVERY_ATTEMPTED 11,014 (0.76%), REJECTED 32. Also time windows and package size.",
    mapping: "The closest direct analogue of a failed-delivery label. Training set downloaded; travel_times.json (1.8 GB) and the evaluation set were skipped.",
    limitations: "Non-commercial. No payment, value or customer. US, obfuscated geography, very few rejections.",
  },
  {
    id: "lade",
    name: "LaDe (Cainiao last-mile delivery)",
    source: "Cainiao-AI on Hugging Face (paper arXiv:2306.10675)",
    url: "https://huggingface.co/datasets/Cainiao-AI/LaDe",
    licence: "Apache-2.0 tag; the card says research use",
    size: "10.7M packages, 21k couriers, 5 Chinese cities; only the 4.7 MB Jilin delivery sample downloaded",
    status: "partial",
    relevance: 1,
    offers: "Courier and geo delivery-time records: accept and delivery times, lat/lng and area type (aoi_type).",
    mapping: "Accept time, city, lat/lng, area type and courier as geo and courier delivery-time features. Time to deliver is a delay proxy.",
    limitations: "China. No value, payment or category, and no failure label (completed deliveries only).",
  },
  {
    id: "kaggle-shipping",
    name: "Kaggle E-Commerce Shipping Data",
    source: "Kaggle (prachi13/customer-analytics)",
    url: "https://www.kaggle.com/datasets/prachi13/customer-analytics",
    licence: "Not recorded; check the Kaggle page",
    size: "~10,999 rows x 12 columns (third-party report, unverified)",
    status: "login required",
    relevance: 1,
    offers: "An on-time delivery target (Reached.on.Time_Y.N) with cost, prior purchases, discount and shipment mode.",
    mapping: "Cost of product stands in for order value, prior purchases for repeat history, late for the outcome proxy.",
    limitations: "Likely synthetic. No payment method, geography or dates; no COD, no pincode. A toy benchmark only.",
  },
  {
    id: "turkish-returns",
    name: "Turkish E-Commerce Product Returns",
    source: "EgehanK on Hugging Face",
    url: "https://huggingface.co/datasets/EgehanK/turkish-ecommerce-product-returns",
    licence: "CC BY 4.0",
    size: "3 MB parquet, 30,411 rows",
    status: "downloaded",
    relevance: 1,
    offers: "Product, brand, price, average rating and Turkish review text for returned products.",
    mapping: "Only price, product and brand map. Possible return-reason NLP or category return-propensity priors, not RTO risk.",
    limitations: "Text only, no negatives, no orders, no customer, payment or outcome label.",
  },
  {
    id: "asos-graphreturns",
    name: "ASOS GraphReturns",
    source: "ASOS / UCL (McGowan et al., FashionXRecSys 2022)",
    url: "https://arxiv.org/abs/2302.14096",
    licence: "Unverified",
    size: "~770k customers, ~410k product variants, Sep-Nov 2021",
    status: "not downloaded",
    relevance: 2,
    offers: "Customer-product graph edges with a return label at scale. The paper reports F1 0.792 for a GNN.",
    mapping: "Customer id, product variant and return flag give a customer-behaviour return label, but for post-delivery returns, not RTO.",
    limitations: "The direct dataset link is unverified (a guessed GitHub path returned 404; the link is in the paper). UK fashion, anonymised, likely no payment or pincode.",
  },
];

export const DATASETS_INDIA: Dataset[] = [
  {
    id: "amazon-delivery-india",
    name: "Amazon Delivery Dataset (India)",
    source: "Kaggle; slug not verified, likely sujalsuthar/amazon-delivery-dataset",
    url: "https://www.kaggle.com/datasets/sujalsuthar/amazon-delivery-dataset",
    licence: "Not recorded",
    size: "Reported ~43,739 rows x 16 columns, Indian cities",
    status: "login required",
    relevance: 2,
    offers: "Delivery time in minutes with order date and time, pickup time, weather, traffic, vehicle, area type and category.",
    mapping: "Order time of day as a feature, area type, category. The outcome is delivery duration only.",
    limitations: "No failure, COD or pincode. Provenance unclear and possibly synthetic. The URL is the likely slug, not a confirmed one.",
  },
  {
    id: "pincode-directory",
    name: "India Post All-India Pincode Directory",
    source: "Department of Posts via data.gov.in; MIT GitHub mirror with lat/long",
    url: "https://data.gov.in/resource/all-india-pincode-directory-till-last-month",
    licence: "GODL-India (the mirror repo is MIT; the data stays GODL)",
    size: "154,823 offices / 19,097 pincodes (official); 157,126 offices / 19,300 pincodes (mirror, 148,288 with lat/long)",
    status: "downloaded",
    relevance: null,
    offers: "Office-level pincode, district, state, delivery or non-delivery status and, in the mirror, latitude and longitude.",
    mapping:
      "Group by pincode, take median lat/long and modal district and state to get a clean master of about 19.3k pincodes that replaces the hand-typed prefix rows. Delivery vs Non Delivery is a serviceability feature. District is the join key to census and NFHS. The first digit is a postal-zone region feature.",
    limitations: "The official file is an old snapshot with no lat/long and Telangana districts under Andhra Pradesh. Lat/long is per post office with gaps and noise. The monthly API needs a free key (not registered).",
  },
  {
    id: "city-tier-census",
    name: "City tier (HRA X/Y/Z) and Census 2011 districts",
    source: "Dept of Expenditure O.M. of 21-07-2015 (via TaxGuru); Census 2011 district table (Hugging Face derived mirror)",
    url: "https://doe.gov.in/orders-circulars/32",
    licence: "Government order (public); CC BY 4.0 for the Census mirror",
    size: "HRA list as saved HTML; 640 districts x 29 columns",
    status: "partial",
    relevance: null,
    offers: "A city classification (X, Y, Z) and district literacy rate, sex ratio and workforce participation.",
    mapping: "X maps to metro, Y to tier-2, Z to tier-3 (an RTO Shield convention; e-commerce tiers are informal). Census features join on LGD code or normalised district name via the pincode directory. SC/ST share is for the fairness audit only.",
    limitations: "The original order PDF was not fetched. The Census mirror has no urban/rural split, and 2011 data is stale (640 vs ~780 districts), so it is a slow-moving proxy.",
  },
  {
    id: "development-proxies",
    name: "District and state development proxies (NFHS-5, RBI, night lights)",
    source: "IIPS / MoHFW NFHS-5 factsheets (GitHub mirror); RBI Handbook of Statistics on Indian States; SHRUG / VIIRS",
    url: "https://github.com/Tejas360/NFHS-5",
    licence: "CC BY 4.0 (NFHS mirror); NDSAP/GODL (official NFHS); RBI publication terms; SHRUG and VIIRS need registration",
    size: "NFHS-5: 341 of ~707 districts (21 states), 131 state-level indicators",
    status: "partial",
    relevance: null,
    offers: "District indicators for electricity, sanitation, clean cooking fuel, health insurance and women's literacy.",
    mapping:
      "A district development index (mean z-score of those five indicators) mapped to income bands by terciles, falling back to state per-capita NSDP. Used only to audit disparity after scoring, never as a model feature.",
    limitations: "The NFHS mirror is incomplete. The RBI file hit a CAPTCHA that was not bypassed. SHRUG and VIIRS were not downloaded. NFHS wealth quintile needs DHS registration.",
  },
  {
    id: "rto-industry-figures",
    name: "Public RTO and COD industry figures",
    source: "ClickPost, Base, Razorpay, Unicommerce pages; Shadowfax 3PL market report (offer document)",
    url: "https://www.clickpost.ai/blog/ecommerce-rto-statistics-india",
    licence: "Publishers' copyright; kept for internal research with citation",
    size: "5 saved pages and one 31-page PDF",
    status: "partial",
    relevance: null,
    offers: "Published RTO rates by payment mode, city tier, category and season, plus RTO causes. See the figures table for the ones used.",
    mapping: "Benchmark priors for the pincode benchmark file and the cold-start blend.",
    limitations: "There is no official national RTO rate and definitions differ (RTO vs failed delivery vs return), so vendor figures are directional. The Delhivery DRHP and Meesho RHP were not downloaded; the Shadowfax PDF was not yet mined.",
  },
  {
    id: "calendars-monsoon",
    name: "Festival and sale calendar, IMD monsoon report",
    source: "IMD Salient Features of SW Monsoon 2026; press sale dates",
    url: "https://mausam.imd.gov.in/Forecast/marquee_data/Salient_Features_SW_MONSOON%20_2026_30_sep.pdf",
    licence: "Government of India / IMD public report (attribute IMD); press sources for sale dates",
    size: "19-page PDF and a small CSV",
    status: "partial",
    relevance: null,
    offers: "Monsoon onset, cover and withdrawal dates with rainfall departures, and 2026 sale dates.",
    mapping: "Features days_to_nearest_festival, is_mega_sale_window and monsoon_active. Sale windows and monsoon months are treated as known regimes so drift alerts do not misfire.",
    limitations: "Major festival dates came from model knowledge and are flagged VERIFY. Normal onset dates and district rainfall were not downloaded. Rebuild yearly because lunar festivals move.",
  },
];

export type Paper = {
  number: string;
  title: string;
  authors: string;
  year: number;
  venue: string;
  url: string;
  topic: string;
  openAccess: boolean;
  findings: string[];
  applied: string;
  module: string;
  depth: "read" | "abstract-level";
};

export const PAPERS: Paper[] = [
  {
    number: "01",
    title: "Early Bird Catches the Worm: Predicting Returns Even Before Purchase in Fashion E-commerce",
    authors: "Sajan Kedia, Manchit Madan, Sumit Borar",
    year: 2019,
    venue: "arXiv:1906.12128 (Myntra, India)",
    url: "https://arxiv.org/abs/1906.12128",
    topic: "Pre-order return prediction",
    openAccess: true,
    findings: [
      "Predicts return probability at the cart page, before the order is placed. A GBM baseline reached AUC 71.6%, and the final DNN with embeddings reached AUC 83.2% with precision 74%.",
      "Top features: product lifetime return rate, cart size, payment type, user lifetime returned quantity, price. Carts above 5 items returned at 72% against 9% for single-item carts.",
      "Thresholds come from the precision-recall curve plus business logic, and High, Medium and Low segments each run as separate A/B tests.",
      "In a live A/B (about 100K users), a personalised delivery charge cut returns 3% while orders fell 1.7%. Restricting Cash on Delivery is listed as an action for high-risk carts.",
    ],
    applied:
      "Build pincode, product, customer-history and payment-mode features. Choose action thresholds from the precision-recall curve and business cost, tier orders into High, Medium and Low, and report order loss next to return reduction in the A/B.",
    module: "features, policy, impact, trainer",
    depth: "read",
  },
  {
    number: "02",
    title: "A Dataset for Learning Graph Representations to Predict Customer Returns in Fashion Retail",
    authors: "Jamie McGowan et al.",
    year: 2023,
    venue: "arXiv:2302.14096 (ASOS / UCL)",
    url: "https://arxiv.org/abs/2302.14096",
    topic: "Return prediction, graph dataset",
    openAccess: true,
    findings: [
      "Releases ASOS GraphReturns, a public dataset of customer, product and order interactions for return prediction.",
      "A GNN reaches F1 0.792 on return classification, ahead of baselines without a representation-learning step.",
      "The graph model also gives lower cross-entropy, suggesting more robust probabilities.",
    ],
    applied:
      "A GNN is not needed for v1. Neighbour-style aggregates over pincode and courier lane approximate relational signals cheaply, computed leakage-safe. The dataset can exercise the training and calibration pipeline and rehearse time-based splits and PSI checks.",
    module: "features, trainer, drift",
    depth: "read",
  },
  {
    number: "03",
    title: "Parcel loss prediction in last-mile delivery: deep and non-deep approaches with insights from Explainable AI",
    authors: "Jan de Leeuw, Zaharah Bukhsh, Yingqian Zhang",
    year: 2023,
    venue: "arXiv:2310.16602 (TU Eindhoven)",
    url: "https://arxiv.org/abs/2310.16602",
    topic: "Delivery-failure prediction, imbalance, XAI",
    openAccess: true,
    findings: [
      "Predicts parcel loss from product, customer and order information, using one year of Belgian shipments.",
      "Extreme class imbalance is the core problem. Deep Hybrid Ensemble Learning (autoencoder plus random forest) gave the best classification performance.",
      "Explainable AI attributions turn predictions into insurance and business decisions, a cost decision like a risk-tiered intervention.",
    ],
    applied:
      "Resampling distorts probabilities, so recalibrate after any rebalancing. Use expected-cost tiers rather than a fixed 0.5 cut, and show per-order SHAP reason codes to reviewers in the manual-review tier.",
    module: "trainer, policy, scorer",
    depth: "abstract-level",
  },
  {
    number: "04",
    title: "Data models for service failure prediction in supply-chain networks",
    authors: "Monika Sharma, Tristan Glatard, Eric Gelinas, Mariam Tagmouti, Brigitte Jaumard",
    year: 2018,
    venue: "arXiv:1810.09944 (Concordia Univ. / ClearDestination)",
    url: "https://arxiv.org/abs/1810.09944",
    topic: "Last-mile delivery failure prediction",
    openAccess: true,
    findings: [
      "Predicts service failures (customer not home, rescheduled, refused or cancelled) on about 500,000 last-mile services.",
      "Random Forest reaches average sensitivity 0.7 and specificity 0.7 across 5 failure types.",
      "Association rules reassert that confirmation calls prevent not-at-home failures.",
      "Time-window size, slack time, customer location and the retailer are strong failure predictors.",
    ],
    applied:
      "Supports the confirmation tier and its A/B test. Geography and merchant identity are useful features, and because location is a top predictor it needs the fairness audit by region.",
    module: "policy, features, fairness",
    depth: "abstract-level",
  },
  {
    number: "05",
    title: "Learning Reasons for Product Returns on E-Commerce",
    authors: "Miriam Farber, Slava Novgorodov, Ido Guy",
    year: 2024,
    venue: "Proc. 7th Workshop on e-Commerce and NLP (ECNLP), LREC-COLING 2024",
    url: "https://aclanthology.org/2024.ecnlp-1.1",
    topic: "Return likelihood and reason prediction",
    openAccess: true,
    findings: [
      "Presented as the first comprehensive study of product returns across multiple e-commerce domains.",
      "Return rates range from about 5% to 60% depending on category and policy.",
      "Proposes supervised prediction of both return likelihood and reason (sizing, defect, no longer needed). Reasons differ by domain.",
    ],
    applied:
      "Segment by category. A reason taxonomy (address wrong, customer unreachable, changed mind, COD refusal) can become auxiliary labels. Address-quality problems map to WhatsApp confirmation and intent problems to a prepaid nudge.",
    module: "features, policy",
    depth: "abstract-level",
  },
  {
    number: "06",
    title: "Predicting Good Probabilities With Supervised Learning",
    authors: "Alexandru Niculescu-Mizil, Rich Caruana",
    year: 2005,
    venue: "Proc. 22nd ICML, pp. 625-632",
    url: "https://www.cs.cornell.edu/~alexn/papers/calibration.icml05.crc.rev3.pdf",
    topic: "Probability calibration",
    openAccess: true,
    findings: [
      "Boosted trees and stumps push probabilities away from 0 and 1, a sigmoid-shaped distortion. Neural nets and bagged trees are naturally well calibrated.",
      "Platt scaling suits sigmoid-shaped bias and small data. Isotonic regression is more flexible but needs more data.",
      "After calibration, boosted trees, random forests and SVMs predict the best probabilities across ten algorithms.",
      "Calibration must use a held-out set separate from training.",
    ],
    applied:
      "Gradient boosting is miscalibrated by default. Fit Platt (small sets) or isotonic (large sets) on a later, time-ordered held-out slice, never on training rows. Report Brier score and reliability curves.",
    module: "trainer, scorer",
    depth: "read",
  },
  {
    number: "07",
    title: "On Calibration of Modern Neural Networks",
    authors: "Chuan Guo, Geoff Pleiss, Yu Sun, Kilian Q. Weinberger",
    year: 2017,
    venue: "Proc. 34th ICML, PMLR 70:1321-1330",
    url: "https://arxiv.org/abs/1706.04599",
    topic: "Calibration, ECE, temperature scaling",
    openAccess: true,
    findings: [
      "Modern deep nets are overconfident even when accurate.",
      "Expected Calibration Error (ECE) and reliability diagrams are the standard measures.",
      "Temperature scaling, a single-parameter variant of Platt scaling, is cheap and surprisingly effective.",
    ],
    applied:
      "Use ECE and reliability diagrams as release gates and keep the calibrator low-parameter when calibration data is small. Track ECE on newly matured outcomes and recalibrate when it degrades even if AUC holds.",
    module: "trainer, drift",
    depth: "read",
  },
  {
    number: "08",
    title: "Causal Inference and Uplift Modeling: A Review of the Literature",
    authors: "Pierre Gutierrez, Jean-Yves Gerardy",
    year: 2017,
    venue: "Proc. Machine Learning Research 67:1-13 (KDD 2016 workshop)",
    url: "https://proceedings.mlr.press/v67/gutierrez17a.html",
    topic: "Uplift modelling, causal measurement",
    openAccess: true,
    findings: [
      "Uplift is the incremental effect of an action on an individual outcome, a causal problem rather than a prediction problem.",
      "Three families: Two-Model, Class Transformation and direct uplift modelling, compared in Rubin's potential-outcomes notation.",
      "Needs randomised treatment and control data, so a holdout is the prerequisite.",
    ],
    applied:
      "A randomised holdout gives the average treatment effect and enables later uplift models. Measure incremental RTO avoided, not RTO among contacted orders. High risk with zero uplift wastes WhatsApp and review cost; start with a two-model approach once holdout data exists.",
    module: "impact, policy",
    depth: "abstract-level",
  },
  {
    number: "09",
    title: "Failing Loudly: An Empirical Study of Methods for Detecting Dataset Shift",
    authors: "Stephan Rabanser, Stephan Gunnemann, Zachary C. Lipton",
    year: 2019,
    venue: "NeurIPS 32 (arXiv:1810.11953)",
    url: "https://arxiv.org/abs/1810.11953",
    topic: "Dataset shift and drift detection",
    openAccess: true,
    findings: [
      "ML systems fail silently under shift. The paper studies detecting, characterising and judging the malignancy of shift.",
      "The best approach found is two-sample testing on dimensionality-reduced inputs using pre-trained classifiers.",
      "Domain-discriminating approaches help characterise whether a shift is harmful. Covers covariate, label and combined shifts.",
    ],
    applied:
      "PSI is a reasonable univariate monitor; add per-feature two-sample tests with multiple-testing correction and a domain classifier on the score distribution. Separate label shift (the festive RTO rate) from covariate shift (new regions or channels) before triggering retraining.",
    module: "drift",
    depth: "read",
  },
  {
    number: "10",
    title: "Equality of Opportunity in Supervised Learning",
    authors: "Moritz Hardt, Eric Price, Nathan Srebro",
    year: 2016,
    venue: "NeurIPS 29 (arXiv:1610.02413)",
    url: "https://arxiv.org/abs/1610.02413",
    topic: "Fairness criteria, post-processing",
    openAccess: true,
    findings: [
      "Proposes equalized odds and equal opportunity as criteria for discrimination against a sensitive attribute.",
      "Shows how to adjust any learned predictor to meet the criterion by post-processing with group-specific thresholds.",
      "The criterion depends only on joint statistics of predictor, target and group. Illustrated with a FICO credit-score case study.",
    ],
    applied:
      "Audit per-region error rates, such as the false-flag rate on orders that would have been delivered, not only flag rates. If disparity appears, group-aware thresholds or capped per-region intervention rates are a remedy, weighed against legal and business constraints.",
    module: "fairness, policy",
    depth: "read",
  },
  {
    number: "11",
    title: "The Measure and Mismeasure of Fairness",
    authors: "Sam Corbett-Davies, Johann D. Gaebler, Hamed Nilforoshan, Ravi Shroff, Sharad Goel",
    year: 2023,
    venue: "JMLR 24(312):1-117 (arXiv:1808.00023)",
    url: "https://arxiv.org/abs/1808.00023",
    topic: "Fairness definitions, proxies, tradeoffs",
    openAccess: true,
    findings: [
      "Sorts fairness definitions into two families, and finds both typically yield strongly Pareto-dominated policies that can harm the groups they protect.",
      "Dropping protected attributes is insufficient when proxies such as location carry the signal.",
      "Argues for modelling the costs and benefits of decisions explicitly instead of axiomatic parity.",
    ],
    applied:
      "Pincode and region are proxies for caste, religion and income, so blindness does not prevent redlining. Audit who gets blocked or gets friction, document the cost-benefit rationale, and prefer soft interventions (confirmation) over COD denial for uncertain pincodes.",
    module: "fairness, policy",
    depth: "abstract-level",
  },
  {
    number: "12",
    title: "Instance-Dependent Cost-Sensitive Learning for Detecting Transfer Fraud",
    authors: "Sebastiaan Hoppner, Bart Baesens, Wouter Verbeke, Tim Verdonck",
    year: 2020,
    venue: "arXiv:2005.02488 [stat.AP]",
    url: "https://arxiv.org/abs/2005.02488",
    topic: "Fraud scoring, cost-sensitive boosting",
    openAccess: true,
    findings: [
      "Fraud detection is instance-dependent cost-sensitive: misclassification costs vary per transaction.",
      "Derives an instance-dependent decision threshold from the cost matrix.",
      "Proposes cslogit and csboost, which minimise the instance-dependent cost directly, and argues AUC ignores the real objective, financial loss.",
    ],
    applied:
      "Per-order threshold p* = intervention cost / loss avoided instead of a global cutoff, since order value, shipping and margin differ per order. Option of a cost-weighted LightGBM objective or order-value sample weights, judged by net rupee savings.",
    module: "policy, trainer, impact",
    depth: "abstract-level",
  },
];

export type RtoFigure = {
  figure: string;
  value: string;
  source: string;
  year: string;
  confidence: string;
};

export const RTO_FIGURES: RtoFigure[] = [
  { figure: "COD RTO rate, D2C brands with 1,000+ COD orders", value: "37.51%", source: "ClickPost network", year: "FY2026", confidence: "Vendor network data, directional. No official national rate exists." },
  { figure: "Prepaid RTO rate, same brands", value: "5.28% (7.1x lower)", source: "ClickPost network", year: "FY2026", confidence: "Vendor network data, directional." },
  { figure: "COD failed or undelivered, platform filing", value: "22.30% (FY25); 24.15% (H1 FY26)", source: "Meesho RHP, via ClickPost", year: "FY25 to H1 FY26", confidence: "Primary filing, read through a secondary page. H1 FY26 is derived." },
  { figure: "Prepaid failed or undelivered, platform filing", value: "2.72% (FY25); 3.61% (H1 FY26)", source: "Meesho RHP, via ClickPost", year: "FY25 to H1 FY26", confidence: "Primary filing, read through a secondary page." },
  { figure: "Industry-average RTO", value: "~14-18%", source: "Delhivery statement on the Ecom Express DRHP (Inc42, Business Standard)", year: "2024", confidence: "Press-reported statement, not the filing itself." },
  { figure: "COD RTO, Tier-3 pincodes vs metros (COD-heavy brands)", value: "23.73% vs 10.92%", source: "ClickPost", year: "FY2026", confidence: "Vendor data, directional." },
  { figure: "RTO by tier, all payment modes (35.8M orders)", value: "Metro 6.60%, Tier 1 8.10%, Tier 2 11.50%, Tier 3+ 12.00%", source: "ClickPost", year: "Oct-Nov 2025", confidence: "Vendor data, festive window only." },
  { figure: "COD RTO bands by category", value: "Fashion 21-32%, health 18-29%, beauty 18-27%, home 16-25%", source: "ClickPost", year: "FY2026", confidence: "Vendor data, bands rather than point values." },
  { figure: "D2C RTO, festive peak vs off-peak", value: "~39% (Nov 2025) vs ~21% (Feb 2026)", source: "Unicommerce / Shipway via Business Standard", year: "2025-26", confidence: "Secondary report; basis for the roughly 1.5-1.8x season multiplier." },
  { figure: "RTO by order number", value: "First order ~29% vs ~22% for orders 6-10", source: "ClickPost", year: "2025-26", confidence: "Vendor data, directional." },
  { figure: "RTOs that start with a failed attempt", value: "97%; orders with 1 / 2 / 3+ NDRs end as RTO 20.2% / 45.5% / 88.5%", source: "ClickPost", year: "2025-26", confidence: "Vendor data, directional." },
  { figure: "Share of RTOs by cause", value: "COD refusal 28-38%, address failure 18-26%, buyer unreachable 14-20%, fake orders 6-12%, carrier failure 5-10%", source: "ClickPost", year: "2025-26", confidence: "Vendor data, ranges." },
  { figure: "Loaded cost per RTO", value: "~Rs 350 (Rs 285-490) at Rs 1,200 AOV", source: "ClickPost", year: "2025-26", confidence: "Vendor estimate with stated AOV." },
  { figure: "COD order return rate vs prepaid in a festive quarter", value: "58% vs under 15%", source: "Unicommerce D2C report", year: "Apr 2026", confidence: "Sample unclear; this is a return rate, not RTO." },
  { figure: "COD RTO vs prepaid, print-on-demand seller", value: "30.1% vs 1.5%", source: "Qikink, cited by ClickPost", year: "2026", confidence: "Single seller, not representative." },
  { figure: "COD RTO vs prepaid, Razorpay blog", value: "25-30% vs 2-3%", source: "Razorpay blog", year: "undated", confidence: "Mostly unsourced; treat as weak." },
  { figure: "COD return multiple vs prepaid; fraudulent COD share", value: "1.8-2.3x; 3-5% of COD orders", source: "Base.com report", year: "2026", confidence: "Low. Methodology not stated." },
];

/** BibTeX for the twelve papers, as recorded in the research notes. */
export const BIBTEX = String.raw`@misc{kedia2019early,
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
}`;
