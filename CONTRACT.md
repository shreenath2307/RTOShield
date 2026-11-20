# RTO Shield — Engineering Contract (single source of truth)

All agents MUST code against these interfaces exactly. Do not rename. If you need something extra, ADD it (optional fields / new endpoints), never break.

Root: `rto-shield/`  ·  Backend: `backend/` (FastAPI, Python 3.13, port 8000)  ·  Frontend: `frontend/` (Next.js 15 App Router, port 3000)

## 0. Ownership (do NOT write files outside your area)

| Agent | Owns |
|---|---|
| backend-core | `backend/app/main.py`, `backend/app/core/**`, `backend/app/db/**`, `backend/app/api/**`, `backend/app/schemas/**`, `backend/app/services/**`, `backend/run.py`, `backend/tests/test_api.py`, root `README.md`, `start.ps1`, `start.sh` |
| ml | `backend/app/ml/**`, `backend/tests/test_ml.py` |
| data-integrations | `backend/app/data/**`, `backend/app/integrations/**`, `backend/sample_data/**`, `backend/tests/test_data.py` |
| frontend-app | `frontend/src/app/(app)/dashboard/**`, `orders/**`, `score/**`, `queue/**`, `live/**`, `frontend/src/components/app/**` |
| frontend-insights | `frontend/src/app/page.tsx` (landing), `frontend/src/app/(app)/onboarding/**`, `heatmap/**`, `impact/**`, `model/**`, `fairness/**`, `settings/**`, `frontend/src/app/c/**` (customer confirm page), `frontend/src/components/landing/**`, `frontend/src/components/insights/**` |
| lead (pre-written, shared, edit only additively) | `backend/requirements.txt`, `frontend/` config, `frontend/src/lib/**`, `frontend/src/components/ui/**`, `frontend/src/components/shell/**`, `frontend/src/app/layout.tsx`, `frontend/src/app/(app)/layout.tsx`, `frontend/src/app/globals.css` |

Python package: every dir under `backend/app` has `__init__.py`. Imports are absolute: `from app.ml.scorer import RiskScorer`.
Settings: `from app.core.config import settings` (pydantic-settings; env prefix `RTO_`). Fields used across agents:
`settings.database_url` (default `sqlite:///./rto_shield.db`), `settings.artifact_dir` (Path, default `backend/artifacts`), `settings.messaging_provider` (`mock`|`twilio`|`meta_whatsapp`|`msg91`), `settings.public_base_url` (default `http://localhost:3000`), `settings.twilio_sid/twilio_token/twilio_from`, `settings.meta_wa_token/meta_wa_phone_id`, `settings.msg91_key`, `settings.shopify_webhook_secret`, `settings.woo_webhook_secret`, `settings.seed_demo` (bool, default True).

## 1. Canonical order schema (python dict / DataFrame columns)

```
order_id: str            order_date: datetime (tz-naive, local IST)
customer_id: str         customer_phone: str|None     customer_name: str|None
pincode: str (6 digits)  city: str|None   state: str|None   address: str|None
order_value: float (INR) payment_method: "COD"|"PREPAID"
product_category: str    sku: str|None    quantity: int
channel: "shopify"|"woocommerce"|"whatsapp"|"instagram"|"website"|"manual"
outcome: "DELIVERED"|"RTO"|None     (None for new/unshipped orders)
```
`app.integrations.csv_mapper.CANONICAL_COLUMNS` = list of the names above in that order.

## 2. data-integrations interfaces

`app/data/benchmarks.py`
- `load_pincode_benchmarks() -> pd.DataFrame` cols: `pincode_prefix` (3-digit str), `state`, `city`, `region` (North|South|East|West|Central|NorthEast), `tier` (1|2|3 int), `lat`, `lng`, `benchmark_rto_cod`, `benchmark_rto_prepaid`, `pseudo_count` (int prior strength), `income_band` (low|mid|high — FAIRNESS AUDIT ONLY, never a model feature). ≥150 prefixes covering all states. Cached.
- `pincode_meta(pincode: str) -> dict` keys: `pincode_prefix, state, city, region, tier, lat, lng, income_band, benchmark_rto_cod, benchmark_rto_prepaid, pseudo_count, source` (`"prefix"|"state"|"national"` fallback chain). Never raises.
- `get_benchmark(pincode: str, payment_method: str) -> float` benchmark RTO probability.

`app/data/synthetic.py`
- `generate_orders(n: int = 8000, seed: int = 42, start: str = "2025-10-01", days: int = 395, with_outcome: bool = True) -> pd.DataFrame` canonical columns. Realistic causal structure: COD ≫ prepaid, tier-3 higher, high value COD higher, new customers higher, late-night orders higher, poor addresses higher, festival (Oct–Nov) & monsoon (Jun–Sep) bumps, some repeat customers with RTO history, category effects (fashion/footwear high, electronics medium, grocery/beauty low). Base COD RTO ≈ 25–30%, prepaid ≈ 4–7%. Include a mild "intervention era": nothing — outcomes are natural.
- `generate_live_order(rng: np.random.Generator | None = None, now: datetime | None = None) -> dict` single canonical order, outcome None.

`app/integrations/csv_mapper.py`
- `CANONICAL_COLUMNS: list[str]`
- `detect_and_map(df_raw: pd.DataFrame) -> MappingResult` (dataclass: `df: pd.DataFrame` canonical & cleaned, `source_format: str` (`shopify|woocommerce|shiprocket|canonical|unknown`), `column_map: dict[str,str]` raw→canonical, `report: dict` = `{rows_in, rows_out, dropped: [{row, reason}] (first 50), dropped_count, warnings: [str], missing_by_column: {col: int}, outcome_distribution: {DELIVERED: n, RTO: n, unknown: n}, date_range: [iso, iso] | None}`). Handles fuzzy header matching, status→outcome mapping ("RTO", "Returned", "RTO Delivered", "cancelled after ship"…), payment mapping ("cod","cash on delivery","Prepaid","razorpay"…), pincode cleanup, dedupe.

`app/integrations/shopify.py` & `woocommerce.py`
- `async fetch_orders(store_url: str, access_token: str, since: datetime | None = None, consumer_secret: str | None = None) -> pd.DataFrame` (canonical; via httpx; paginated) — must raise `IntegrationError(msg)` cleanly on failure.
- `normalize_webhook(payload: dict) -> dict` canonical order dict (outcome None).
- `verify_webhook(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool` (HMAC-SHA256 base64; returns True if secret is None/empty — dev mode).
- `IntegrationError` lives in `app/integrations/__init__.py`.

`app/integrations/messaging.py`
- `@dataclass SendResult(ok: bool, provider: str, message_id: str | None, error: str | None = None)`
- `class MessagingProvider: name: str; async send(to: str, channel: Literal["whatsapp","sms"], body: str, meta: dict | None = None) -> SendResult`
- Providers: `MockProvider` (logs, always ok, keeps `sent: list` in memory), `TwilioProvider`, `MetaWhatsAppProvider`, `Msg91Provider` (real httpx calls, graceful error).
- `get_provider(name: str | None = None) -> MessagingProvider` (defaults to settings.messaging_provider).
- `render_template(kind: Literal["confirm","prepaid_nudge","address_verify"], order: dict, link: str, store_name: str, lang: Literal["en","hi"] = "en") -> str`.

## 3. ml interfaces (`app/ml/`)

`app/ml/seasonality.py` — `season_flags(dt: datetime) -> dict{is_festival_window: bool, festival_name: str|None, is_monsoon: bool, is_sale_period: bool}`

`app/ml/trainer.py`
- `train(df: pd.DataFrame, seller_id: str, artifact_dir: Path, config: dict | None = None) -> dict` (TrainReport). df = canonical with outcome (rows with outcome None ignored). Time-based split (last 20% by order_date = test). Leakage-safe features (pincode/customer stats computed only from strictly earlier orders; target encodings smoothed with benchmark prior — empirical Bayes). Model: gradient boosting (LightGBM if importable else sklearn HistGradientBoostingClassifier) + isotonic/sigmoid calibration. Raises `ValueError` if < 200 labelled rows or single class.
- TrainReport keys: `version` (e.g. "v3-20261120-1530"), `trained_at` (iso), `algorithm`, `n_train`, `n_test`, `split` ("time-based"), `base_rate`, `metrics{roc_auc, pr_auc, brier, log_loss, precision_high, recall_high, precision_medium, recall_medium}`, `baselines{cod_only:{roc_auc, pr_auc}, pincode_benchmark:{roc_auc, pr_auc}}`, `calibration:[{bin, predicted, observed, count}]`, `pr_curve:[{precision, recall, threshold}]` (≤100 pts), `roc_curve:[{fpr, tpr}]` (≤100), `feature_importance:[{feature, label, importance}]`, `thresholds{medium, high}` (suggested), `cost_curve:[{threshold, flagged_pct, rto_caught_pct, est_net_savings}]`, `confusion_high{tp, fp, tn, fn}`, `artifact_path` (str).

`app/ml/scorer.py`
- `@dataclass ScoringContext(customer_history: dict[str, dict] = {} /* customer_id -> {orders:int, rto:int, delivered:int, last_order_at: datetime|None} */, pincode_stats: dict[str, dict] = {} /* pincode -> {orders:int, rto:int} */, thresholds: dict = {"medium":0.18,"high":0.35}, n_seller_labelled: int = 0, pincode_cap: float = 0.35)`
- `class RiskScorer`:
  - `@classmethod load(cls, artifact_path: str | Path) -> RiskScorer`
  - `@classmethod cold_start(cls) -> RiskScorer` — benchmark-driven transparent model (no training needed).
  - `version: str`, `is_cold_start: bool`
  - `score(self, orders: list[dict], context: ScoringContext) -> list[dict]` each: `{probability: float, tier: "low"|"medium"|"high", confidence: "low"|"medium"|"high", cold_start: bool, model_version: str, reasons: [{feature, label, value (display str), impact (signed float, + = raises risk), direction: "up"|"down"}] (top 6, sorted by |impact|), pincode_share: float (fraction of risk attributable to pincode), fairness_adjusted: bool}`.
  - Blending: when `n_seller_labelled` is small, blend model prob with benchmark prior (weight w = n/(n+500)). Fairness guard: if pincode_share > pincode_cap and tier=="high" solely due to pincode, downgrade to "medium" and set `fairness_adjusted=True`.
  - `what_if(self, order: dict, changes: dict, context: ScoringContext) -> dict{base: <score dict>, new: <score dict>, delta: float}`.
- Local explanations: per-feature contributions (e.g. LightGBM `pred_contrib=True`, or occlusion vs. reference for sklearn). Human labels: "Cash on Delivery", "Pincode RTO history", "New customer", "Order placed 1:42 AM", "Order value ₹3,499 (high band)", "Incomplete address", "Festival season".

`app/ml/fairness.py` — `fairness_report(df: pd.DataFrame) -> dict` where df has canonical cols + `probability`, `tier`. Groups by `income_band`, `tier` (pincode tier), `region` via `pincode_meta`. Returns `{status: "pass"|"warn"|"fail", groups: {dim: [{group, n, flag_rate, mean_score, observed_rto_rate, tpr, fpr, calibration_gap}]}, disparate_impact: {dim: ratio}, equal_opportunity_gap: {dim: float}, pincode_blind: {roc_auc_full, roc_auc_blind, flag_overlap}, findings: [str], recommendations: [str]}`.

`app/ml/drift.py` — `drift_report(reference: pd.DataFrame, current: pd.DataFrame) -> dict{overall_psi, features:[{feature, psi, status: "stable"|"moderate"|"drift"}], rto_rate_reference, rto_rate_current, retrain_recommended: bool, reasons: [str], season: season_flags(now)}`.

## 4. REST API (backend-core) — prefix `/api`, JSON, CORS allow localhost:3000

Common types (TS mirror in `frontend/src/lib/types.ts`):
- `Prediction {probability, tier, confidence, cold_start, model_version, reasons: Reason[], pincode_share, fairness_adjusted, created_at}`
- `Recommendation {action: ActionType, reason: string, expected_saving: number, action_cost: number, alternatives: {action, net_value}[]}`
- `ActionType = "NONE"|"CONFIRM_WHATSAPP"|"CONFIRM_SMS"|"CONFIRM_CALL"|"PREPAID_NUDGE"|"ADDRESS_VERIFY"|"MANUAL_REVIEW"|"HOLDOUT_CONTROL"`
- `Action {id, order_id, type, status: "PENDING"|"SENT"|"DELIVERED"|"RESPONDED"|"CONFIRMED"|"CANCELLED"|"CONVERTED_PREPAID"|"ADDRESS_UPDATED"|"EXPIRED"|"FAILED", channel, message, response, experiment_group: "treatment"|"control", cost, token, created_at, updated_at}`
- `OrderStatus = "NEW"|"SCORED"|"AWAITING_CUSTOMER"|"CONFIRMED"|"CONVERTED_PREPAID"|"ON_HOLD"|"APPROVED"|"CANCELLED"|"SHIPPED"|"DELIVERED"|"RTO"`
- `Order {id: number, order_id, order_date, customer_id, customer_name, customer_phone (masked), pincode, city, state, address, order_value, payment_method, product_category, sku, quantity, channel, outcome, status, is_historical, prediction: Prediction|null, recommendation: Recommendation|null}`

Endpoints:
| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | /api/health | | `{status, model_version, cold_start, orders}` |
| POST | /api/ingest/csv | multipart `file` | `{upload_id, source_format, column_map, report, rows_imported, labelled_rows}` |
| POST | /api/ingest/demo | `?n=8000&train=true` | same + `train_report` |
| POST | /api/ingest/shopify/sync | `{store_url, access_token}` | same as csv |
| POST | /api/ingest/woocommerce/sync | `{store_url, consumer_key, consumer_secret}` | same |
| POST | /api/webhooks/shopify/orders-create | Shopify payload (HMAC header) | `ScoredOrder` |
| POST | /api/webhooks/woocommerce/order-created | Woo payload | `ScoredOrder` |
| POST | /api/model/train | | TrainReport |
| GET | /api/model/active | | `{version, cold_start, report: TrainReport|null, n_labelled}` |
| GET | /api/model/versions | | `[{version, trained_at, metrics, is_active}]` |
| POST | /api/model/activate/{version} | | `{ok}` |
| GET | /api/model/drift | | drift_report |
| GET | /api/model/fairness | | fairness_report |
| POST | /api/score | `OrderIn` (canonical minus outcome; order_id optional, order_date optional=now) `?auto_action=true` | `ScoredOrder {order: Order, prediction, recommendation, action: Action|null}` |
| POST | /api/score/what-if | `{order: OrderIn, changes: {...}}` | `{base: Prediction, new: Prediction, delta}` |
| POST | /api/score/batch | multipart `file` | `{items: ScoredOrder[], summary: {low, medium, high}}` |
| GET | /api/orders | `tier, status, q, payment_method, historical(bool), page=1, page_size=25, sort=-created` | `{items: Order[], total, page, page_size}` |
| GET | /api/orders/{id} | | `{order: Order, predictions: Prediction[], actions: Action[], timeline: [{at, kind, text}]}` |
| POST | /api/orders/{id}/outcome | `{outcome: "DELIVERED"|"RTO"}` | Order |
| POST | /api/orders/{id}/actions | `{type: ActionType, channel?}` | Action |
| GET | /api/queue | `?status=pending` | `{items: Order[] (tier high/medium needing decision), counts}` |
| POST | /api/queue/{id}/decision | `{decision: "approve"|"hold"|"cancel"|"send_confirmation"|"send_prepaid_nudge"|"verify_address", note?}` | Order |
| GET | /api/public/confirm/{token} | | `{store_name, order: {order_id, items, order_value, payment_method, masked_address, city, pincode}, kind, options: [...], expired, already_responded}` |
| POST | /api/public/confirm/{token} | `{response: "confirm"|"cancel"|"convert_prepaid"|"update_address", address?, pincode?}` | `{ok, message, payment_link?}` |
| GET | /api/dashboard/summary | | `{orders_analyzed, labelled_orders, historical_rto_rate, cod_rto_rate, prepaid_rto_rate, live_orders, tiers{low, medium, high}, flagged_today, interventions_sent, confirmation_rate, prepaid_conversion_rate, est_savings, est_savings_label, model_version, cold_start}` |
| GET | /api/dashboard/trend | `?granularity=week|month` | `[{period, orders, rto_rate, cod_share, cod_rto_rate, prepaid_rto_rate, predicted_rto_rate|null}]` |
| GET | /api/dashboard/top-risk | `?by=pincode|category|state|city&limit=10` | `[{key, label, orders, rto, observed_rate, smoothed_rate, benchmark, lift, low_sample: bool}]` (min-sample safeguards + smoothing) |
| GET | /api/dashboard/heatmap | | `[{pincode_prefix, city, state, lat, lng, orders, rto, observed_rate, smoothed_rate, benchmark, avg_risk, tier, income_band}]` |
| GET | /api/impact/report | | `{label:"Estimated — validate with pilot", baseline:{period, orders, rto_rate}, post:{period, orders, rto_rate}, relative_reduction, experiment:{treatment:{n, rto_rate}, control:{n, rto_rate}, uplift, p_value, ci95:[lo,hi], significant}, costs:{per_rto_cost, rto_avoided, gross_saved, intervention_cost, net_saved, roi}, by_action:[{action, n, confirm_rate, rto_rate, cost}], monthly:[{period, rto_rate, saved}], target:{min:0.15, max:0.25, met: bool}}` |
| GET | /api/impact/report.csv | | CSV download |
| GET | /api/settings | | Settings |
| PUT | /api/settings | partial Settings | Settings |
| GET | /api/stream/events | SSE | events `{type: "order_scored"|"action_updated"|"model_trained"|"outcome_recorded", data}` |
| POST | /api/simulate/start | `{rate_per_min: 20, resolve_outcomes: true}` | `{running}` |
| POST | /api/simulate/stop | | `{running}` |
| GET | /api/simulate/status | | `{running, rate_per_min, generated}` |
| GET | /api/benchmarks/pincode/{pincode} | | pincode_meta |

Settings object:
```
{store_name, thresholds:{medium:0.18, high:0.35},
 costs:{forward_shipping:70, return_shipping:70, packaging:25, turnover_cost_pct:0.04, margin_pct:0.35, whatsapp_msg:0.8, sms:0.25, call:6},
 actions:{low:"NONE", medium:"CONFIRM_WHATSAPP", high:"PREPAID_NUDGE", auto_trigger:true, policy:"cost_optimal"|"tier_rules"},
 holdout_pct:0.1, messaging:{provider:"mock", default_channel:"whatsapp", language:"en"},
 fairness:{pincode_cap:0.35, enforce:true}, retrain:{schedule_days:7, drift_psi_threshold:0.2, auto:true}}
```

Policy (`app/services/policy.py`): cost-aware expected value. `loss = forward+return+packaging+turnover_pct*value`. For action a: `net(a) = p*eff_a*loss - cost_a - (1-p)*friction_a*margin_pct*value`. Effectiveness priors: confirm 0.35, prepaid_nudge 0.55 (×acceptance 0.3), address_verify 0.25, manual_review 0.5, call 0.45. Respect tier rules when policy="tier_rules". Never auto-cancel. Holdout: `holdout_pct` of flagged orders → `HOLDOUT_CONTROL` (no intervention) for causal measurement.

Real-time: orders scored via `/api/score`, webhooks or the simulator publish to an in-process pub/sub → SSE. Scheduler (APScheduler or asyncio loop) retrains every `retrain.schedule_days` or when drift PSI > threshold.

Startup: if `seed_demo` and DB empty → generate synthetic (8000), import as historical, train, then generate ~150 recent live (unlabelled) scored orders with actions so dashboards look alive.
