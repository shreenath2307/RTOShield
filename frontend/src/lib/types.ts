// Mirror of CONTRACT.md §4. Keep in sync with backend schemas.

export type Tier = "low" | "medium" | "high";
export type PaymentMethod = "COD" | "PREPAID";
export type Outcome = "DELIVERED" | "RTO" | null;
export type Channel = "shopify" | "woocommerce" | "whatsapp" | "instagram" | "website" | "manual";

export type ActionType =
  | "NONE"
  | "CONFIRM_WHATSAPP"
  | "CONFIRM_SMS"
  | "CONFIRM_CALL"
  | "PREPAID_NUDGE"
  | "ADDRESS_VERIFY"
  | "MANUAL_REVIEW"
  | "HOLDOUT_CONTROL";

export type ActionStatus =
  | "PENDING"
  | "SENT"
  | "DELIVERED"
  | "RESPONDED"
  | "CONFIRMED"
  | "CANCELLED"
  | "CONVERTED_PREPAID"
  | "ADDRESS_UPDATED"
  | "EXPIRED"
  | "FAILED";

export type OrderStatus =
  | "NEW"
  | "SCORED"
  | "AWAITING_CUSTOMER"
  | "CONFIRMED"
  | "CONVERTED_PREPAID"
  | "ON_HOLD"
  | "APPROVED"
  | "CANCELLED"
  | "SHIPPED"
  | "DELIVERED"
  | "RTO";

export interface Reason {
  feature: string;
  label: string;
  value: string;
  impact: number;
  direction: "up" | "down";
}

export interface Prediction {
  probability: number;
  tier: Tier;
  confidence: "low" | "medium" | "high";
  cold_start: boolean;
  model_version: string;
  reasons: Reason[];
  pincode_share: number;
  fairness_adjusted: boolean;
  created_at?: string;
}

export interface Recommendation {
  action: ActionType;
  reason: string;
  expected_saving: number;
  action_cost: number;
  alternatives: { action: ActionType; net_value: number }[];
}

export interface Action {
  id: number;
  order_id: number;
  type: ActionType;
  status: ActionStatus;
  channel: string | null;
  message: string | null;
  response: string | null;
  experiment_group: "treatment" | "control";
  cost: number;
  token: string | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: number;
  order_id: string;
  order_date: string;
  customer_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  pincode: string;
  city: string | null;
  state: string | null;
  address: string | null;
  order_value: number;
  payment_method: PaymentMethod;
  product_category: string;
  sku: string | null;
  quantity: number;
  channel: Channel;
  outcome: Outcome;
  status: OrderStatus;
  is_historical: boolean;
  prediction: Prediction | null;
  recommendation: Recommendation | null;
}

export interface OrderIn {
  order_id?: string;
  order_date?: string;
  customer_id: string;
  customer_phone?: string | null;
  customer_name?: string | null;
  pincode: string;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  order_value: number;
  payment_method: PaymentMethod;
  product_category: string;
  sku?: string | null;
  quantity: number;
  channel: Channel;
}

export interface ScoredOrder {
  order: Order;
  prediction: Prediction;
  recommendation: Recommendation;
  action: Action | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface OrderDetail {
  order: Order;
  predictions: Prediction[];
  actions: Action[];
  timeline: { at: string; kind: string; text: string }[];
}

export interface DataQualityReport {
  rows_in: number;
  rows_out: number;
  dropped: { row: number; reason: string }[];
  dropped_count: number;
  warnings: string[];
  missing_by_column: Record<string, number>;
  outcome_distribution: Record<string, number>;
  date_range: [string, string] | null;
}

export interface IngestResult {
  upload_id: number;
  source_format: string;
  column_map: Record<string, string>;
  report: DataQualityReport;
  rows_imported: number;
  labelled_rows: number;
  train_report?: TrainReport;
}

export interface TrainReport {
  version: string;
  trained_at: string;
  algorithm: string;
  n_train: number;
  n_test: number;
  split: string;
  base_rate: number;
  metrics: {
    roc_auc: number;
    pr_auc: number;
    brier: number;
    log_loss: number;
    precision_high: number;
    recall_high: number;
    precision_medium: number;
    recall_medium: number;
  };
  baselines: Record<string, { roc_auc: number; pr_auc: number }>;
  calibration: { bin: number; predicted: number; observed: number; count: number }[];
  pr_curve: { precision: number; recall: number; threshold: number }[];
  roc_curve: { fpr: number; tpr: number }[];
  feature_importance: { feature: string; label: string; importance: number }[];
  thresholds: { medium: number; high: number };
  cost_curve: { threshold: number; flagged_pct: number; rto_caught_pct: number; est_net_savings: number }[];
  confusion_high: { tp: number; fp: number; tn: number; fn: number };
  artifact_path: string;
}

export interface ActiveModel {
  version: string;
  cold_start: boolean;
  report: TrainReport | null;
  n_labelled: number;
}

export interface ModelVersionRow {
  version: string;
  trained_at: string;
  metrics: TrainReport["metrics"];
  is_active: boolean;
}

export interface DriftReport {
  overall_psi: number;
  features: { feature: string; psi: number; status: "stable" | "moderate" | "drift" }[];
  rto_rate_reference: number;
  rto_rate_current: number;
  retrain_recommended: boolean;
  reasons: string[];
  season: { is_festival_window: boolean; festival_name: string | null; is_monsoon: boolean; is_sale_period: boolean };
}

export interface FairnessGroup {
  group: string;
  n: number;
  flag_rate: number;
  mean_score: number;
  observed_rto_rate: number;
  tpr: number | null;
  fpr: number | null;
  calibration_gap: number | null;
}

export interface FairnessReport {
  status: "pass" | "warn" | "fail";
  groups: Record<string, FairnessGroup[]>;
  disparate_impact: Record<string, number>;
  equal_opportunity_gap: Record<string, number>;
  pincode_blind: { roc_auc_full: number; roc_auc_blind: number; flag_overlap: number };
  findings: string[];
  recommendations: string[];
}

export interface DashboardSummary {
  orders_analyzed: number;
  labelled_orders: number;
  historical_rto_rate: number;
  cod_rto_rate: number;
  prepaid_rto_rate: number;
  live_orders: number;
  tiers: { low: number; medium: number; high: number };
  flagged_today: number;
  interventions_sent: number;
  confirmation_rate: number;
  prepaid_conversion_rate: number;
  est_savings: number;
  est_savings_label: string;
  model_version: string;
  cold_start: boolean;
}

export interface TrendPoint {
  period: string;
  orders: number;
  rto_rate: number;
  cod_share: number;
  cod_rto_rate: number;
  prepaid_rto_rate: number;
  predicted_rto_rate: number | null;
}

export interface TopRiskRow {
  key: string;
  label: string;
  orders: number;
  rto: number;
  observed_rate: number;
  smoothed_rate: number;
  benchmark: number;
  lift: number;
  low_sample: boolean;
}

export interface HeatCell {
  pincode_prefix: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  orders: number;
  rto: number;
  observed_rate: number;
  smoothed_rate: number;
  benchmark: number;
  avg_risk: number | null;
  tier: number;
  income_band: string;
}

export interface ImpactReport {
  label: string;
  baseline: { period: string; orders: number; rto_rate: number };
  post: { period: string; orders: number; rto_rate: number };
  relative_reduction: number;
  experiment: {
    treatment: { n: number; rto_rate: number };
    control: { n: number; rto_rate: number };
    uplift: number;
    p_value: number | null;
    ci95: [number, number] | null;
    significant: boolean;
  };
  costs: {
    per_rto_cost: number;
    rto_avoided: number;
    gross_saved: number;
    intervention_cost: number;
    net_saved: number;
    roi: number;
  };
  by_action: { action: ActionType; n: number; confirm_rate: number; rto_rate: number; cost: number }[];
  monthly: { period: string; rto_rate: number; saved: number }[];
  target: { min: number; max: number; met: boolean };
}

export interface Settings {
  store_name: string;
  thresholds: { medium: number; high: number };
  costs: {
    forward_shipping: number;
    return_shipping: number;
    packaging: number;
    turnover_cost_pct: number;
    margin_pct: number;
    whatsapp_msg: number;
    sms: number;
    call: number;
  };
  actions: {
    low: ActionType;
    medium: ActionType;
    high: ActionType;
    auto_trigger: boolean;
    policy: "cost_optimal" | "tier_rules";
  };
  holdout_pct: number;
  messaging: { provider: "mock" | "twilio" | "meta_whatsapp" | "msg91"; default_channel: "whatsapp" | "sms"; language: "en" | "hi" };
  fairness: { pincode_cap: number; enforce: boolean };
  retrain: { schedule_days: number; drift_psi_threshold: number; auto: boolean };
}

export interface PublicConfirm {
  store_name: string;
  order: {
    order_id: string;
    items: string;
    order_value: number;
    payment_method: PaymentMethod;
    masked_address: string;
    city: string;
    pincode: string;
  };
  kind: "confirm" | "prepaid_nudge" | "address_verify";
  options: string[];
  expired: boolean;
  already_responded: boolean;
}

export interface Health {
  status: string;
  model_version: string;
  cold_start: boolean;
  orders: number;
  seeding?: string;
}

export type StreamEvent =
  | { type: "order_scored"; data: ScoredOrder }
  | { type: "action_updated"; data: Action }
  | { type: "model_trained"; data: TrainReport }
  | { type: "outcome_recorded"; data: Order };
