"use client";
import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, BrainCircuit, MapPin, MessageCircle, Pause, Play, Send, Zap } from "lucide-react";
import { api } from "@/lib/api";
import type { Action, OrderIn, ScoredOrder, Tier } from "@/lib/types";
import { AnimatedNumber, Button, Card, CardHeader, Empty, PageHeader, RiskBadge } from "@/components/ui";
import { ACTION_LABEL, cn, inr, TIER_META, timeAgo } from "@/lib/utils";
import { PaymentBadge, CATEGORIES } from "@/components/app/order-status";
import { ReasonChips } from "@/components/app/reason-bars";
import { StreamDot } from "@/components/app/live-feed";
import { asScored, useEventStream, type StreamMsg } from "@/components/app/use-event-stream";

const KEEP = 60;

interface SysEvent {
  id: string;
  at: number;
  text: string;
  kind: "action" | "model" | "outcome";
}

export default function LivePage() {
  const qc = useQueryClient();
  const [items, setItems] = React.useState<ScoredOrder[]>([]);
  const [events, setEvents] = React.useState<SysEvent[]>([]);
  const [counts, setCounts] = React.useState<Record<Tier, number>>({ low: 0, medium: 0, high: 0 });
  const [pulseKey, setPulseKey] = React.useState(0);
  const [, force] = React.useReducer((x: number) => x + 1, 0);

  React.useEffect(() => {
    const t = setInterval(force, 15_000);
    return () => clearInterval(t);
  }, []);

  const seenRef = React.useRef<Set<number>>(new Set());
  const seededRef = React.useRef(false);
  const bump = React.useCallback((list: ScoredOrder[]) => {
    const delta: Record<Tier, number> = { low: 0, medium: 0, high: 0 };
    let any = false;
    list.forEach((s) => {
      if (seenRef.current.has(s.order.id)) return;
      seenRef.current.add(s.order.id);
      if (s.prediction?.tier) {
        delta[s.prediction.tier] += 1;
        any = true;
      }
    });
    if (any) setCounts((c) => ({ low: c.low + delta.low, medium: c.medium + delta.medium, high: c.high + delta.high }));
  }, []);

  const push = React.useCallback(
    (s: ScoredOrder) => {
      bump([s]);
      setItems((prev) => (prev.some((x) => x.order.id === s.order.id) ? prev.map((x) => (x.order.id === s.order.id ? { ...s, action: s.action ?? x.action } : x)) : [s, ...prev].slice(0, KEEP)));
      setPulseKey((k) => k + 1);
    },
    [bump]
  );

  const onEvent = React.useCallback(
    (m: StreamMsg) => {
      if (m.type === "order_scored") {
        const s = asScored(m.data);
        if (s) push(s);
        return;
      }
      const id = `${m.type}-${m.at}-${Math.random().toString(36).slice(2, 6)}`;
      if (m.type === "action_updated") {
        const a = m.data as Partial<Action>;
        setItems((prev) => prev.map((x) => (x.order.id === a.order_id ? { ...x, action: { ...(x.action ?? {}), ...a } as Action } : x)));
        setEvents((e) => [{ id, at: m.at, kind: "action" as const, text: `${ACTION_LABEL[a.type as keyof typeof ACTION_LABEL] ?? a.type ?? "Action"} → ${String(a.status ?? "").toLowerCase()}` }, ...e].slice(0, 20));
      } else if (m.type === "model_trained") {
        const r = m.data as { version?: string; metrics?: { roc_auc?: number } };
        setEvents((e) => [{ id, at: m.at, kind: "model" as const, text: `Model retrained ${r.version ?? ""}${r.metrics?.roc_auc ? ` · AUC ${r.metrics.roc_auc.toFixed(3)}` : ""}` }, ...e].slice(0, 20));
        toast.success("Model retrained", { description: r.version });
        qc.invalidateQueries({ queryKey: ["summary"] });
      } else if (m.type === "outcome_recorded") {
        const o = m.data as { order_id?: string; outcome?: string };
        setEvents((e) => [{ id, at: m.at, kind: "outcome" as const, text: `${o.order_id ?? "Order"} → ${o.outcome ?? "outcome"}` }, ...e].slice(0, 20));
      }
    },
    [push, qc]
  );

  const { status } = useEventStream(onEvent);
  const polling = status === "error" || status === "closed";

  // Seed + fallback polling
  const seed = useQuery({
    queryKey: ["orders", "live-seed"],
    queryFn: () => api.orders({ sort: "-created", page_size: 20, historical: false }),
    refetchInterval: polling ? 5000 : false,
  });
  React.useEffect(() => {
    const list = (seed.data?.items ?? [])
      .filter((o) => o.prediction)
      .map((o): ScoredOrder => ({ order: o, prediction: o.prediction!, recommendation: o.recommendation!, action: null }));
    if (!list.length) return;
    if (!seededRef.current) {
      // initial seed: mark as seen without counting (counters are "this session")
      list.forEach((s) => seenRef.current.add(s.order.id));
      seededRef.current = true;
    } else {
      const fresh = list.filter((s) => !seenRef.current.has(s.order.id));
      if (!fresh.length) return;
      bump(fresh);
      setPulseKey((k) => k + 1);
    }
    setItems((prev) => {
      const ids = new Set(prev.map((p) => p.order.id));
      const fresh = list.filter((s) => !ids.has(s.order.id));
      if (!fresh.length) return prev;
      return [...fresh, ...prev].sort((a, b) => b.order.id - a.order.id).slice(0, KEEP);
    });
  }, [seed.data, bump]);

  const latest = items[0];

  return (
    <div>
      <PageHeader
        eyebrow="Operate"
        title="Live feed"
        description="Each order is scored on arrival. Risky COD orders get a confirmation, prepaid offer or review."
        actions={<StreamDot status={polling ? "polling" : status} />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="mb-4 grid grid-cols-3 gap-3">
            {(["low", "medium", "high"] as Tier[]).map((t) => (
              <Card key={t} className="relative overflow-hidden p-4">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", TIER_META[t].dot)} />
                  <span className="label">{TIER_META[t].label} risk</span>
                </div>
                <AnimatedNumber value={counts[t]} className="mt-2 block text-[36px] font-display font-normal text-ink" />
                <div className="text-[11.5px] text-ink-4">this session</div>
                <span className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: TIER_META[t].hex, opacity: 0.6 }} />
              </Card>
            ))}
          </div>

          {items.length === 0 ? (
            <Card>
              <Empty
                icon={<Activity size={18} />}
                title={seed.isLoading ? "Connecting…" : "No live orders yet"}
                hint="Start the simulator or send a test order."
              />
            </Card>
          ) : (
            <ul className="space-y-3">
              <AnimatePresence initial={false}>
                {items.map((s) => (
                  <motion.li
                    key={s.order.id}
                    layout
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <LiveCard s={s} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Card className="p-5">
            <div className="label mb-3">Latest score</div>
            {latest ? (
              <div className="flex items-center gap-4">
                <div className="relative grid h-[88px] w-[88px] place-items-center">
                  <MiniRing p={latest.prediction.probability} color={TIER_META[latest.prediction.tier]?.hex} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium text-ink">{latest.order.order_id}</div>
                  <div className="text-[12px] text-ink-4">
                    {latest.order.city ?? latest.order.pincode} · {inr(latest.order.order_value)}
                  </div>
                  <div className="mt-1.5">
                    <RiskBadge tier={latest.prediction.tier} probability={latest.prediction.probability} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[13px] text-ink-4">Waiting…</div>
            )}
          </Card>

          <SimulatorCard />

          <Card className="pb-3">
            <CardHeader title="System events" subtitle="Actions, outcomes & retrains" />
            <ul className="scroll-thin mt-3 max-h-[260px] space-y-1 overflow-y-auto px-5" data-lenis-prevent>
              <AnimatePresence initial={false}>
                {events.length === 0 && <li className="py-4 text-[12.5px] text-ink-4">No events yet.</li>}
                {events.map((e) => (
                  <motion.li key={e.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-start gap-2 py-1.5 text-[12.5px]">
                    {e.kind === "action" ? (
                      <MessageCircle size={13} className="mt-0.5 shrink-0 text-brand-500" />
                    ) : e.kind === "model" ? (
                      <BrainCircuit size={13} className="mt-0.5 shrink-0 text-cyan-600" />
                    ) : (
                      <Zap size={13} className="mt-0.5 shrink-0 text-amber-500" />
                    )}
                    <span className="flex-1 text-ink-2">{e.text}</span>
                    <span className="shrink-0 text-ink-4">{timeAgo(new Date(e.at).toISOString())}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MiniRing({ p, color }: { p: number; color?: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg width={88} height={88} className="relative -rotate-90">
      <circle cx={44} cy={44} r={r} fill="white" stroke="#ECE6DD" strokeWidth={8} />
      <motion.circle cx={44} cy={44} r={r} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeDasharray={c} initial={false} animate={{ strokeDashoffset: c * (1 - Math.min(1, p)) }} transition={{ duration: 0.8 }} />
      <text x={44} y={44} transform="rotate(90 44 44)" textAnchor="middle" dominantBaseline="central" className="fill-ink text-[17px] font-medium">
        {Math.round(p * 100)}%
      </text>
    </svg>
  );
}

function LiveCard({ s }: { s: ScoredOrder }) {
  const o = s.order;
  const p = s.prediction;
  const hex = TIER_META[p.tier]?.hex;
  return (
    <Link href={`/orders/${o.id}`} className="group block">
      <Card className="relative overflow-hidden p-4 transition">
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: hex }} />
        <div className="flex flex-wrap items-start gap-4 pl-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-medium text-ink">{o.order_id}</span>
              <PaymentBadge method={o.payment_method} />
              <span className="text-[12px] capitalize text-ink-4">{o.product_category}</span>
              <span className="text-[12px] text-ink-4">· {o.channel}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} />
                {o.city ?? "—"}, {o.state ?? ""} {o.pincode}
              </span>
              <span className="num font-medium text-ink-2">{inr(o.order_value)}</span>
              <span>{timeAgo(p.created_at ?? o.order_date)}</span>
            </div>
            <div className="mt-2">
              <ReasonChips reasons={p.reasons} />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <RiskBadge tier={p.tier} probability={p.probability} />
            <span className="text-[12px] text-ink-3">
              {s.action ? (
                <>
                  {ACTION_LABEL[s.action.type] ?? s.action.type} · <span className="lowercase">{s.action.status}</span>
                </>
              ) : s.recommendation ? (
                ACTION_LABEL[s.recommendation.action]
              ) : null}
            </span>
          </div>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-canvas-3">
          <motion.div initial={{ width: 0 }} animate={{ width: `${p.probability * 100}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className="h-full rounded-full" style={{ background: hex }} />
        </div>
      </Card>
    </Link>
  );
}

const CITIES: { pincode: string; city: string; state: string }[] = [
  { pincode: "560034", city: "Bengaluru", state: "Karnataka" },
  { pincode: "110017", city: "New Delhi", state: "Delhi" },
  { pincode: "400070", city: "Mumbai", state: "Maharashtra" },
  { pincode: "842001", city: "Muzaffarpur", state: "Bihar" },
  { pincode: "283203", city: "Firozabad", state: "Uttar Pradesh" },
  { pincode: "751002", city: "Bhubaneswar", state: "Odisha" },
  { pincode: "302012", city: "Jaipur", state: "Rajasthan" },
  { pincode: "785001", city: "Jorhat", state: "Assam" },
];

function randomOrder(): OrderIn {
  const c = CITIES[Math.floor(Math.random() * CITIES.length)];
  const cod = Math.random() < 0.65;
  return {
    customer_id: `CUST-T${Math.floor(Math.random() * 90000 + 10000)}`,
    customer_name: ["Aarav Sharma", "Priya Nair", "Rohit Yadav", "Sneha Patel", "Imran Khan", "Kavya Reddy"][Math.floor(Math.random() * 6)],
    customer_phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    pincode: c.pincode,
    city: c.city,
    state: c.state,
    address: Math.random() < 0.3 ? "Near temple" : "Flat 12B, Green Residency, MG Road",
    order_value: Math.round(299 + Math.random() * 4200),
    payment_method: cod ? "COD" : "PREPAID",
    product_category: CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)],
    quantity: 1 + Math.floor(Math.random() * 3),
    channel: (["website", "shopify", "instagram", "whatsapp"] as const)[Math.floor(Math.random() * 4)],
  };
}

function SimulatorCard() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["sim-status"], queryFn: api.simStatus, refetchInterval: 4000, retry: 0 });
  const [rate, setRate] = React.useState(20);
  React.useEffect(() => {
    if (status.data?.rate_per_min) setRate(status.data.rate_per_min);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.data?.running]);
  const running = !!status.data?.running;
  const toggle = useMutation({
    mutationFn: () => (running ? api.simStop() : api.simStart(rate, true)),
    onSuccess: (r) => {
      toast.success(r.running ? `Simulator running at ${rate}/min` : "Simulator stopped");
      qc.invalidateQueries({ queryKey: ["sim-status"] });
    },
    onError: (e: Error) => toast.error("Simulator error", { description: e.message }),
  });
  const apply = useMutation({
    mutationFn: async () => {
      await api.simStop();
      return api.simStart(rate, true);
    },
    onSuccess: () => {
      toast.success(`Rate updated to ${rate}/min`);
      qc.invalidateQueries({ queryKey: ["sim-status"] });
    },
  });
  const test = useMutation({
    mutationFn: () => api.score(randomOrder(), true),
    onSuccess: (r) => toast.success(`Scored ${r.order?.order_id ?? "order"}`, { description: `${Math.round((r.prediction?.probability ?? 0) * 100)}% · ${r.prediction?.tier} risk` }),
    onError: (e: Error) => toast.error("Could not score", { description: e.message }),
  });

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[15px] font-medium text-ink">Order simulator</div>
          <div className="text-[12.5px] text-ink-3">{status.error ? "Simulator unavailable" : running ? `${status.data?.generated ?? 0} generated` : "Idle"}</div>
        </div>
        <span className={cn("h-2.5 w-2.5 rounded-full", running ? "bg-emerald-500" : "bg-ink-5")} />
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-[12.5px]">
          <span className="text-ink-3">Rate</span>
          <span className="num font-medium text-ink">{rate} orders/min</span>
        </div>
        <input type="range" min={2} max={120} step={1} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="w-full accent-brand-500" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button className="flex-1" variant={running ? "secondary" : "primary"} loading={toggle.isPending} onClick={() => toggle.mutate()}>
          {running ? <Pause size={14} /> : <Play size={14} />}
          {running ? "Stop" : "Start"}
        </Button>
        {running && status.data?.rate_per_min !== rate && (
          <Button variant="secondary" loading={apply.isPending} onClick={() => apply.mutate()}>
            Apply rate
          </Button>
        )}
      </div>
      <Button variant="ghost" className="mt-2 w-full" loading={test.isPending} onClick={() => test.mutate()}>
        <Send size={14} /> Send test order
      </Button>
    </Card>
  );
}
