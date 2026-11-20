// Typed API client. All calls go through Next rewrites (/api -> FastAPI :8000).
import type {
  ActionType,
  ActiveModel,
  Action,
  DashboardSummary,
  DriftReport,
  FairnessReport,
  HeatCell,
  Health,
  ImpactReport,
  IngestResult,
  ModelVersionRow,
  Order,
  OrderDetail,
  OrderIn,
  Paged,
  Prediction,
  PublicConfirm,
  ScoredOrder,
  Settings,
  TopRiskRow,
  TrainReport,
  TrendPoint,
  Tier,
} from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: isForm ? init?.headers : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j);
    } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const qs = (p: Record<string, string | number | boolean | undefined | null>) => {
  const s = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && s.set(k, String(v)));
  const out = s.toString();
  return out ? `?${out}` : "";
};

export const api = {
  health: () => req<Health>("/api/health"),

  // ingest
  ingestCsv: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<IngestResult>("/api/ingest/csv", { method: "POST", body: fd });
  },
  ingestDemo: (n = 8000, train = true) => req<IngestResult>(`/api/ingest/demo${qs({ n, train })}`, { method: "POST" }),
  shopifySync: (store_url: string, access_token: string) =>
    req<IngestResult>("/api/ingest/shopify/sync", json({ store_url, access_token })),
  wooSync: (store_url: string, consumer_key: string, consumer_secret: string) =>
    req<IngestResult>("/api/ingest/woocommerce/sync", json({ store_url, consumer_key, consumer_secret })),

  // model
  train: () => req<TrainReport>("/api/model/train", { method: "POST" }),
  activeModel: () => req<ActiveModel>("/api/model/active"),
  modelVersions: () => req<ModelVersionRow[]>("/api/model/versions"),
  activateModel: (version: string) => req<{ ok: boolean }>(`/api/model/activate/${encodeURIComponent(version)}`, { method: "POST" }),
  drift: () => req<DriftReport>("/api/model/drift"),
  fairness: () => req<FairnessReport>("/api/model/fairness"),

  // scoring
  score: (order: OrderIn, auto_action = true) => req<ScoredOrder>(`/api/score${qs({ auto_action })}`, json(order)),
  whatIf: (order: OrderIn, changes: Partial<OrderIn>) =>
    req<{ base: Prediction; new: Prediction; delta: number }>("/api/score/what-if", json({ order, changes })),
  scoreBatch: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<{ items: ScoredOrder[]; summary: Record<Tier, number> }>("/api/score/batch", { method: "POST", body: fd });
  },

  // orders
  orders: (p: { tier?: Tier | ""; status?: string; q?: string; payment_method?: string; historical?: boolean; page?: number; page_size?: number; sort?: string } = {}) =>
    req<Paged<Order>>(`/api/orders${qs(p)}`),
  order: (id: number | string) => req<OrderDetail>(`/api/orders/${id}`),
  recordOutcome: (id: number, outcome: "DELIVERED" | "RTO") => req<Order>(`/api/orders/${id}/outcome`, json({ outcome })),
  triggerAction: (id: number, type: ActionType, channel?: string) => req<Action>(`/api/orders/${id}/actions`, json({ type, channel })),

  // queue
  queue: (status = "pending") => req<{ items: Order[]; counts: Record<string, number> }>(`/api/queue${qs({ status })}`),
  decide: (id: number, decision: "approve" | "hold" | "cancel" | "send_confirmation" | "send_prepaid_nudge" | "verify_address", note?: string) =>
    req<Order>(`/api/queue/${id}/decision`, json({ decision, note })),

  // public (customer-facing)
  publicConfirm: (token: string) => req<PublicConfirm>(`/api/public/confirm/${token}`),
  publicRespond: (token: string, body: { response: "confirm" | "cancel" | "convert_prepaid" | "update_address"; address?: string; pincode?: string }) =>
    req<{ ok: boolean; message: string; payment_link?: string }>(`/api/public/confirm/${token}`, json(body)),

  // dashboard
  summary: () => req<DashboardSummary>("/api/dashboard/summary"),
  trend: (granularity: "week" | "month" = "week") => req<TrendPoint[]>(`/api/dashboard/trend${qs({ granularity })}`),
  topRisk: (by: "pincode" | "category" | "state" | "city" = "pincode", limit = 10) =>
    req<TopRiskRow[]>(`/api/dashboard/top-risk${qs({ by, limit })}`),
  heatmap: () => req<HeatCell[]>("/api/dashboard/heatmap"),

  // impact
  impact: () => req<ImpactReport>("/api/impact/report"),
  impactCsvUrl: () => `${BASE}/api/impact/report.csv`,

  // settings
  settings: () => req<Settings>("/api/settings"),
  updateSettings: (s: Partial<Settings>) => req<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(s) }),

  // simulator
  simStart: (rate_per_min = 20, resolve_outcomes = true) => req<{ running: boolean }>("/api/simulate/start", json({ rate_per_min, resolve_outcomes })),
  simStop: () => req<{ running: boolean }>("/api/simulate/stop", { method: "POST" }),
  simStatus: () => req<{ running: boolean; rate_per_min: number; generated: number }>("/api/simulate/status"),

  pincode: (pin: string) => req<Record<string, unknown>>(`/api/benchmarks/pincode/${pin}`),
};

/** SSE stream URL. EventSource goes directly to the backend to avoid proxy buffering. */
export const streamUrl = () =>
  `${process.env.NEXT_PUBLIC_STREAM_ORIGIN ?? "http://127.0.0.1:8000"}/api/stream/events`;
