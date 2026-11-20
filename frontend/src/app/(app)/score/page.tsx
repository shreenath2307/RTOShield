"use client";
import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUpRight, FileUp, Gauge, MapPin, Moon, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { api } from "@/lib/api";
import type { Channel, OrderIn, PaymentMethod, ScoredOrder, Tier } from "@/lib/types";
import { Badge, Button, Card, CardHeader, Empty, ErrorNote, PageHeader, RiskBadge, Segmented, Table, Td, Th } from "@/components/ui";
import { ACTION_LABEL, cn, inr, num, pct, TIER_META } from "@/lib/utils";
import { ActionStatusChip, CATEGORIES, PaymentBadge } from "@/components/app/order-status";
import { ReasonBars } from "@/components/app/reason-bars";
import { RecommendationCard, ScoreSummary } from "@/components/app/recommendation-card";

type Form = {
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  pincode: string;
  address: string;
  order_value: string;
  payment_method: PaymentMethod;
  product_category: string;
  quantity: string;
  channel: Channel;
  order_time: string; // HH:MM, optional
};

const EMPTY: Form = {
  customer_id: "",
  customer_name: "",
  customer_phone: "",
  pincode: "",
  address: "",
  order_value: "",
  payment_method: "COD",
  product_category: "fashion",
  quantity: "1",
  channel: "website",
  order_time: "",
};

const SAMPLES: Record<"risky" | "safe", Form> = {
  risky: {
    customer_id: `NEW-${Math.floor(Math.random() * 90000 + 10000)}`,
    customer_name: "Rahul Kumar",
    customer_phone: "9123456780",
    pincode: "842001",
    address: "near hanuman mandir",
    order_value: "3499",
    payment_method: "COD",
    product_category: "fashion",
    quantity: "3",
    channel: "instagram",
    order_time: "01:42",
  },
  safe: {
    customer_id: "CUST-00042",
    customer_name: "Ananya Iyer",
    customer_phone: "9876501234",
    pincode: "560034",
    address: "Flat 1203, Tower 4, Prestige Shantiniketan, Whitefield Main Road",
    order_value: "1299",
    payment_method: "PREPAID",
    product_category: "beauty",
    quantity: "1",
    channel: "website",
    order_time: "14:10",
  },
};

export default function ScorePage() {
  const [tab, setTab] = React.useState<"single" | "batch">("single");
  return (
    <div>
      <PageHeader
        eyebrow="Operate"
        title="Score an order"
        description="RTO risk score, the reasons behind it and the cheapest next step."
        actions={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "single", label: "Single order" },
              { value: "batch", label: "Batch CSV" },
            ]}
          />
        }
      />
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
          {tab === "single" ? <SingleScore /> : <BatchScore />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function usePincode(pin: string) {
  const valid = /^\d{6}$/.test(pin);
  return useQuery({ queryKey: ["pincode", pin], queryFn: () => api.pincode(pin), enabled: valid, staleTime: Infinity, retry: 0 });
}

function SingleScore() {
  const [f, setF] = React.useState<Form>(EMPTY);
  const [auto, setAuto] = React.useState(true);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const pin = usePincode(f.pincode);
  const meta = pin.data as Record<string, unknown> | undefined;

  const score = useMutation({
    mutationFn: () => {
      let order_date: string | undefined;
      if (f.order_time) {
        const d = new Date();
        const [h, m] = f.order_time.split(":").map(Number);
        const pad = (n: number) => String(n).padStart(2, "0");
        order_date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:00`;
      }
      const body: OrderIn = {
        customer_id: f.customer_id || `WALKIN-${Date.now().toString().slice(-6)}`,
        customer_name: f.customer_name || null,
        customer_phone: f.customer_phone || null,
        pincode: f.pincode,
        city: (meta?.city as string) ?? null,
        state: (meta?.state as string) ?? null,
        address: f.address || null,
        order_value: Number(f.order_value) || 0,
        payment_method: f.payment_method,
        product_category: f.product_category,
        quantity: Math.max(1, Number(f.quantity) || 1),
        channel: f.channel,
        order_date,
      };
      return api.score(body, auto);
    },
    onError: (e: Error) => toast.error("Scoring failed", { description: e.message }),
  });

  const valid = /^\d{6}$/.test(f.pincode) && Number(f.order_value) > 0;
  const fill = (k: "risky" | "safe") => {
    setF({ ...SAMPLES[k], customer_id: k === "risky" ? `NEW-${Math.floor(Math.random() * 90000 + 10000)}` : SAMPLES.safe.customer_id });
    score.reset();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <Card>
        <CardHeader
          title="Order details"
          subtitle="Fields map to the canonical order schema"
          right={
            <div className="flex gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => fill("risky")}>
                <Moon size={13} className="text-rose-500" /> Risky sample
              </Button>
              <Button size="sm" variant="secondary" onClick={() => fill("safe")}>
                <ShieldCheck size={13} className="text-emerald-500" /> Safe sample
              </Button>
            </div>
          }
          className="flex-wrap"
        />
        <form
          className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) score.mutate();
          }}
        >
          <L label="Customer ID">
            <input className="input" value={f.customer_id} onChange={(e) => set("customer_id", e.target.value)} placeholder="Auto if empty" />
          </L>
          <L label="Customer name">
            <input className="input" value={f.customer_name} onChange={(e) => set("customer_name", e.target.value)} placeholder="Optional" />
          </L>
          <L label="Phone">
            <input className="input" value={f.customer_phone} onChange={(e) => set("customer_phone", e.target.value.replace(/[^\d+]/g, ""))} placeholder="10-digit mobile" inputMode="tel" />
          </L>
          <L label="Pincode *">
            <input className="input num" value={f.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6 digits" inputMode="numeric" />
          </L>
          <div className="sm:col-span-2">
            <AnimatePresence>{/^\d{6}$/.test(f.pincode) && <PinMeta loading={pin.isLoading} error={pin.error} meta={meta} />}</AnimatePresence>
          </div>
          <L label="Address" className="sm:col-span-2">
            <textarea className="input h-auto min-h-[64px] py-2" value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="House / street / landmark" />
          </L>
          <L label="Order value (₹) *">
            <input className="input num" value={f.order_value} onChange={(e) => set("order_value", e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 1499" inputMode="decimal" />
          </L>
          <L label="Payment">
            <Segmented
              className="w-full [&>button]:flex-1"
              value={f.payment_method}
              onChange={(v) => set("payment_method", v)}
              options={[
                { value: "COD", label: "COD" },
                { value: "PREPAID", label: "Prepaid" },
              ]}
            />
          </L>
          <L label="Category">
            <select className="input capitalize" value={f.product_category} onChange={(e) => set("product_category", e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </L>
          <L label="Quantity">
            <input className="input num" type="number" min={1} value={f.quantity} onChange={(e) => set("quantity", e.target.value)} />
          </L>
          <L label="Channel">
            <select className="input capitalize" value={f.channel} onChange={(e) => set("channel", e.target.value as Channel)}>
              {(["website", "shopify", "woocommerce", "instagram", "whatsapp", "manual"] as Channel[]).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </L>
          <L label="Order time (today)">
            <input className="input num" type="time" value={f.order_time} onChange={(e) => set("order_time", e.target.value)} />
          </L>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-3">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-4 w-4 accent-brand-500" />
              Auto-trigger recommended action
            </label>
            <Button type="submit" size="lg" disabled={!valid} loading={score.isPending}>
              <Gauge size={16} /> Score order
            </Button>
          </div>
        </form>
      </Card>

      <div className="min-w-0">
        <AnimatePresence mode="wait">
          {score.data ? (
            <motion.div key={score.data.order?.id ?? "r"} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
              <Result r={score.data} />
            </motion.div>
          ) : score.error ? (
            <motion.div key="err">
              <ErrorNote error={score.error} />
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card className="grid min-h-[420px] place-items-center">
                <Empty icon={<Sparkles size={18} />} title="No score yet" hint="Fill the form or load a sample order." />
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PinMeta({ loading, error, meta }: { loading: boolean; error: unknown; meta?: Record<string, unknown> }) {
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-canvas-2 px-3 py-2.5 text-[12.5px] ring-1 ring-line">
        {loading ? (
          <span className="text-ink-4">Looking up pincode…</span>
        ) : error || !meta ? (
          <span className="text-ink-4">Pincode lookup unavailable — national benchmark will be used.</span>
        ) : (
          <>
            <span className="inline-flex items-center gap-1 font-medium text-ink">
              <MapPin size={12} /> {String(meta.city ?? "—")}, {String(meta.state ?? "—")}
            </span>
            {meta.tier != null && <Badge tone={Number(meta.tier) === 3 ? "amber" : Number(meta.tier) === 1 ? "green" : "neutral"}>Tier {String(meta.tier)}</Badge>}
            {meta.region != null && <span className="text-ink-4">{String(meta.region)}</span>}
            <span className="text-ink-3">
              Benchmark RTO: COD <b className="num font-medium text-amber-600">{pct(Number(meta.benchmark_rto_cod))}</b> · Prepaid{" "}
              <b className="num font-medium text-emerald-600">{pct(Number(meta.benchmark_rto_prepaid))}</b>
            </span>
            {meta.source != null && meta.source !== "prefix" && <Badge>{String(meta.source)} fallback</Badge>}
          </>
        )}
      </div>
    </motion.div>
  );
}

function Result({ r }: { r: ScoredOrder }) {
  const p = r.prediction ?? r.order?.prediction;
  if (!p) return <ErrorNote error="No prediction returned" />;
  const rec = r.recommendation ?? r.order?.recommendation;
  return (
    <Card className="overflow-hidden">
      <div className="relative border-b border-line bg-canvas-2 p-6">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink">{r.order?.order_id}</span>
          {r.order?.id != null && (
            <Link href={`/orders/${r.order.id}`} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-600 hover:underline">
              Open order <ArrowUpRight size={13} />
            </Link>
          )}
        </div>
        <ScoreSummary p={p} size={240} />
      </div>
      <div className="grid gap-6 p-6">
        <div>
          <div className="label mb-3">Why this score</div>
          <ReasonBars reasons={p.reasons} />
        </div>
        <div className="border-t border-line pt-5">
          <RecommendationCard rec={rec} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-canvas-2 px-4 py-3 text-[13px] ring-1 ring-line">
          {r.action ? (
            <>
              <span className="text-ink-2">
                <b className="font-medium text-ink">{ACTION_LABEL[r.action.type] ?? r.action.type}</b> auto-triggered
                {r.action.channel ? ` via ${r.action.channel}` : ""}
                {r.action.experiment_group === "control" ? " (holdout — no message sent)" : ""}
              </span>
              <ActionStatusChip status={r.action.status} />
            </>
          ) : (
            <span className="text-ink-3">No action auto-triggered.</span>
          )}
        </div>
      </div>
    </Card>
  );
}

function L({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[12.5px] font-medium text-ink-3">{label}</span>
      {children}
    </label>
  );
}

/* ---------------- Batch ---------------- */
function BatchScore() {
  const [file, setFile] = React.useState<File | null>(null);
  const [drag, setDrag] = React.useState(false);
  const [filter, setFilter] = React.useState<Tier | "all">("all");
  const m = useMutation({
    mutationFn: (f: File) => api.scoreBatch(f),
    onSuccess: (r) => toast.success(`Scored ${num(r.items?.length ?? 0)} orders`),
    onError: (e: Error) => toast.error("Batch scoring failed", { description: e.message }),
  });
  const pick = (f?: File | null) => {
    if (!f) return;
    setFile(f);
    m.mutate(f);
  };
  const items = (m.data?.items ?? []).filter((s) => filter === "all" || s.prediction?.tier === filter);
  const summary = m.data?.summary ?? { low: 0, medium: 0, high: 0 };
  const total = (summary.low ?? 0) + (summary.medium ?? 0) + (summary.high ?? 0);

  return (
    <div className="space-y-6">
      <Card
        className={cn("grid place-items-center border-dashed p-10 text-center transition", drag && "border-brand-400 bg-brand-50/40")}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files?.[0]);
        }}
      >
        <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-canvas-3 text-ink-3">
          <FileUp size={20} />
        </span>
        <div className="text-[15px] font-medium text-ink">Drop a CSV of unshipped orders</div>
        <p className="mt-1 max-w-md text-[13px] text-ink-3">Shopify, WooCommerce, Shiprocket or canonical exports are auto-detected. Each row is scored and gets a recommended action.</p>
        <label className="mt-4">
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-ink px-4 text-sm font-medium text-white hover:bg-ink-2">
            {m.isPending ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Upload size={14} />}
            {m.isPending ? "Scoring…" : "Choose file"}
          </span>
        </label>
        {file && <div className="mt-2 text-[12px] text-ink-4">{file.name}</div>}
      </Card>

      {m.error && <ErrorNote error={m.error} />}

      {m.data && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <SummaryTile label="Scored" value={total} />
            {(["high", "medium", "low"] as Tier[]).map((t) => (
              <SummaryTile key={t} label={`${TIER_META[t].label} risk`} value={summary[t] ?? 0} color={TIER_META[t].hex} share={total ? (summary[t] ?? 0) / total : 0} />
            ))}
          </div>
          <Card className="overflow-hidden">
            <CardHeader
              title="Scored orders"
              subtitle="Sorted by risk"
              right={
                <Segmented
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "all", label: "All" },
                    { value: "high", label: "High" },
                    { value: "medium", label: "Medium" },
                    { value: "low", label: "Low" },
                  ]}
                />
              }
            />
            <div className="mt-3">
              <Table className="max-h-[560px] overflow-y-auto">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    <Th>Order</Th>
                    <Th>Location</Th>
                    <Th className="text-right">Value</Th>
                    <Th>Payment</Th>
                    <Th>Risk</Th>
                    <Th>Top reason</Th>
                    <Th>Recommended</Th>
                  </tr>
                </thead>
                <tbody>
                  {[...items]
                    .sort((a, b) => (b.prediction?.probability ?? 0) - (a.prediction?.probability ?? 0))
                    .map((s, i) => (
                      <tr key={s.order?.id ?? i} className="hover:bg-canvas-2">
                        <Td className="font-medium text-ink">{s.order?.id ? <Link href={`/orders/${s.order.id}`}>{s.order.order_id}</Link> : s.order?.order_id}</Td>
                        <Td>
                          {s.order?.city ?? "—"} <span className="num text-ink-4">{s.order?.pincode}</span>
                        </Td>
                        <Td className="num text-right">{inr(s.order?.order_value)}</Td>
                        <Td>
                          <PaymentBadge method={s.order?.payment_method} />
                        </Td>
                        <Td>{s.prediction && <RiskBadge tier={s.prediction.tier} probability={s.prediction.probability} />}</Td>
                        <Td className="max-w-[220px] truncate text-ink-3">{s.prediction?.reasons?.find((x) => x.impact > 0)?.label ?? "—"}</Td>
                        <Td className="text-ink-3">{s.recommendation ? ACTION_LABEL[s.recommendation.action] : "—"}</Td>
                      </tr>
                    ))}
                </tbody>
              </Table>
              {!items.length && <Empty title="No orders in this tier" />}
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

function SummaryTile({ label, value, color, share }: { label: string; value: number; color?: string; share?: number }) {
  return (
    <Card className="p-4">
      <div className="label">{label}</div>
      <div className="num mt-2 text-[36px] font-display font-normal" style={color ? { color } : undefined}>
        {num(value)}
      </div>
      {share != null && (
        <div className="mt-2 h-1 rounded-full bg-canvas-3">
          <motion.div initial={{ width: 0 }} animate={{ width: `${share * 100}%` }} transition={{ duration: 0.7 }} className="h-full rounded-full" style={{ background: color }} />
        </div>
      )}
    </Card>
  );
}
