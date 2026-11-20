"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, Cell, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { AlertTriangle, ArrowRight, CalendarHeart, CheckCircle2, Info, PackageSearch, ShieldAlert, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import type { DashboardSummary, TopRiskRow, TrendPoint } from "@/lib/types";
import { AnimatedNumber, Badge, Button, Card, CardHeader, ChartTooltip, Empty, ErrorNote, PageHeader, Segmented, Skeleton, Stat, Table, Td, Th } from "@/components/ui";
import { CHART, cn, inrCompact, num, pct } from "@/lib/utils";
import { MiniFeed } from "@/components/app/live-feed";
import { CommandPalette } from "@/components/app/command-palette";

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } } };

export default function DashboardPage() {
  const summary = useQuery({ queryKey: ["summary"], queryFn: api.summary, refetchInterval: 20_000 });
  const drift = useQuery({ queryKey: ["drift"], queryFn: api.drift, retry: 0, staleTime: 300_000 });
  const s = summary.data;
  const season = drift.data?.season;

  return (
    <div>
      <PageHeader
        eyebrow="Operate"
        title="Overview"
        description="COD order trends, where RTO risk concentrates, and the actions taken."
        actions={
          <>
            <CommandPalette />
            <Link href="/score">
              <Button>Score an order</Button>
            </Link>
          </>
        }
      />

      {s?.cold_start && <ColdStartBanner />}

      {season && (season.is_festival_window || season.is_monsoon || season.is_sale_period) && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mb-5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-[12px] text-ink-2">
            <CalendarHeart size={13} className="text-brand-500" />
            Seasonal context:
            {season.is_festival_window && <b className="font-medium">{season.festival_name ?? "Festival"} window</b>}
            {season.is_monsoon && <b className="font-medium">Monsoon</b>}
            {season.is_sale_period && <b className="font-medium">Sale period</b>}
            <span className="text-ink-4">RTO usually runs higher in this period. The model adjusts for it.</span>
          </span>
        </motion.div>
      )}

      {summary.error ? <ErrorNote error={summary.error} /> : <KpiRow s={s} />}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <TrendCard />
        <TierCard s={s} loading={summary.isLoading} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <TopRiskCard />
        <Card className="pb-3">
          <CardHeader title="Live scoring" subtitle="Latest scored orders" />
          <div className="mt-3 px-3">
            <MiniFeed />
          </div>
        </Card>
      </div>
    </div>
  );
}

function ColdStartBanner() {
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-6 overflow-hidden rounded-2xl border border-line bg-canvas-2 p-5">
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white text-ink-3">
          <Info size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-ink">Cold start: scoring with benchmarks</div>
          <p className="mt-0.5 text-[13px] text-ink-3">
            There are too few labelled orders to train a model. Risk is estimated from pincode and payment benchmarks, category priors and order signals. Upload past orders with delivery outcomes to train on your own data.
          </p>
        </div>
        <Link href="/onboarding">
          <Button variant="secondary">
            Connect data <ArrowRight size={14} />
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}

function KpiRow({ s }: { s?: DashboardSummary }) {
  if (!s)
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[126px] rounded-2xl" />
        ))}
      </div>
    );
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <motion.div variants={item}>
        <Stat
          label="Orders analyzed"
          icon={<PackageSearch size={15} />}
          value={<AnimatedNumber value={s.orders_analyzed ?? 0} />}
          sub={
            <>
              {num(s.labelled_orders)} labelled · {num(s.live_orders)} live
            </>
          }
        />
      </motion.div>
      <motion.div variants={item}>
        <Stat
          label="Historical RTO rate"
          icon={<AlertTriangle size={15} />}
          value={<AnimatedNumber value={(s.historical_rto_rate ?? 0) * 100} format={(v) => `${v.toFixed(1)}%`} />}
          sub={
            <span className="flex gap-3">
              <span>
                COD <b className="num font-medium text-amber-600">{pct(s.cod_rto_rate)}</b>
              </span>
              <span>
                Prepaid <b className="num font-medium text-emerald-600">{pct(s.prepaid_rto_rate)}</b>
              </span>
            </span>
          }
        />
      </motion.div>
      <motion.div variants={item}>
        <Stat
          label="Flagged today"
          icon={<ShieldAlert size={15} />}
          value={<AnimatedNumber value={s.flagged_today ?? 0} />}
          sub={
            <>
              <span className="font-medium text-rose-600">{num(s.tiers?.high)}</span> high-risk · {num(s.interventions_sent)} nudges sent
            </>
          }
        />
      </motion.div>
      <motion.div variants={item}>
        <Stat
          label="Est. ₹ saved"
          icon={<Wallet size={15} />}
          value={<AnimatedNumber value={s.est_savings ?? 0} format={(v) => inrCompact(v)} />}
          sub={<Badge tone="amber">{s.est_savings_label || "Estimated"}</Badge>}
        />
      </motion.div>
      <motion.div variants={item}>
        <Stat
          label="Confirmation rate"
          icon={<CheckCircle2 size={15} />}
          value={<AnimatedNumber value={(s.confirmation_rate ?? 0) * 100} format={(v) => `${v.toFixed(1)}%`} />}
          sub={<>Prepaid conversion {pct(s.prepaid_conversion_rate)}</>}
        />
      </motion.div>
    </motion.div>
  );
}

function TrendCard() {
  const [g, setG] = React.useState<"week" | "month">("week");
  const q = useQuery({ queryKey: ["trend", g], queryFn: () => api.trend(g) });
  const data = (q.data ?? []).map((d: TrendPoint) => ({
    period: d.period,
    "RTO rate": d.rto_rate,
    "COD RTO": d.cod_rto_rate,
    "Prepaid RTO": d.prepaid_rto_rate,
    Predicted: d.predicted_rto_rate,
  }));
  return (
    <Card className="xl:col-span-2">
      <CardHeader
        title="RTO rate trend"
        subtitle="Actual vs predicted, split by payment method"
        right={
          <Segmented
            value={g}
            onChange={setG}
            options={[
              { value: "week", label: "Weekly" },
              { value: "month", label: "Monthly" },
            ]}
          />
        }
      />
      <div className="h-[300px] px-2 pb-4 pt-4">
        {q.isLoading ? (
          <Skeleton className="mx-3 h-full" />
        ) : q.error ? (
          <div className="px-3">
            <ErrorNote error={q.error} />
          </div>
        ) : !data.length ? (
          <Empty title="No trend data yet" hint="Import historical orders to see RTO trends." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 16, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="period" tick={{ fill: CHART.axis, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fill: CHART.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
              <Tooltip content={<ChartTooltip formatter={(v) => pct(v)} />} />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12, color: CHART.axis, paddingTop: 8 }} />
              <Area type="monotone" dataKey="RTO rate" stroke={CHART.brand} strokeWidth={1.5} fill={CHART.brand} fillOpacity={0.08} />
              <Line type="monotone" dataKey="COD RTO" stroke={CHART.med} strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="Prepaid RTO" stroke={CHART.low} strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="Predicted" stroke={CHART.ink} strokeDasharray="4 4" strokeWidth={1.5} dot={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

function TierCard({ s, loading }: { s?: DashboardSummary; loading: boolean }) {
  const t = s?.tiers ?? { low: 0, medium: 0, high: 0 };
  const total = (t.low ?? 0) + (t.medium ?? 0) + (t.high ?? 0);
  const data = [
    { name: "Low", value: t.low ?? 0, color: CHART.low },
    { name: "Medium", value: t.medium ?? 0, color: CHART.med },
    { name: "High", value: t.high ?? 0, color: CHART.high },
  ];
  return (
    <Card>
      <CardHeader title="Risk-tier distribution" subtitle="Live (unshipped) scored orders" />
      {loading ? (
        <Skeleton className="m-5 h-[240px]" />
      ) : !total ? (
        <Empty title="No scored orders yet" />
      ) : (
        <div className="px-5 pb-5">
          <div className="relative mx-auto h-[190px] w-[190px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data} dataKey="value" innerRadius={62} outerRadius={88} paddingAngle={2} stroke="none" startAngle={90} endAngle={-270}>
                  {data.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip formatter={(v) => `${num(v)} (${pct(v / total)})`} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <AnimatedNumber value={total} className="text-[36px] font-display font-normal text-ink" />
                <div className="text-[11px] text-ink-4">orders</div>
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {data.map((d) => (
              <div key={d.name} className="flex items-center gap-3 text-[13px]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                <span className="flex-1 text-ink-2">{d.name}</span>
                <span className="num font-medium text-ink">{num(d.value)}</span>
                <span className="num w-12 text-right text-ink-4">{pct(d.value / total, 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

type By = "pincode" | "category" | "state" | "city";
function TopRiskCard() {
  const [by, setBy] = React.useState<By>("pincode");
  const q = useQuery({ queryKey: ["top-risk", by], queryFn: () => api.topRisk(by, 10) });
  return (
    <Card className="xl:col-span-2">
      <CardHeader
        title={
          <span className="flex items-center gap-1.5">
            Riskiest segments
            <span className="group relative">
              <Info size={13} className="cursor-help text-ink-4" />
              <span className="pointer-events-none absolute left-1/2 top-6 z-20 w-72 -translate-x-1/2 rounded-xl border border-line bg-white p-3 text-[12px] font-normal leading-relaxed text-ink-3 opacity-0 shadow-lift transition group-hover:opacity-100">
                <b className="text-ink">Safeguards.</b> Rates are smoothed toward the regional benchmark (empirical Bayes), so small segments can’t look extreme by chance. Segments with too few
                orders are marked <i>low sample</i>. Lift = smoothed rate ÷ benchmark. Pincode is never used alone to block an order.
              </span>
            </span>
          </span>
        }
        subtitle="Smoothed RTO rate vs benchmark"
        right={
          <Segmented
            value={by}
            onChange={setBy}
            options={[
              { value: "pincode", label: "Pincode" },
              { value: "category", label: "Category" },
              { value: "state", label: "State" },
            ]}
          />
        }
      />
      <div className="mt-3 pb-2">
        {q.isLoading ? (
          <div className="space-y-2 px-5 pb-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : q.error ? (
          <div className="px-5 pb-4">
            <ErrorNote error={q.error} />
          </div>
        ) : !q.data?.length ? (
          <Empty title="Not enough data" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{by}</Th>
                <Th className="text-right">Orders</Th>
                <Th className="min-w-[160px]">Smoothed RTO</Th>
                <Th className="text-right">Observed</Th>
                <Th className="text-right">Benchmark</Th>
                <Th className="text-right">Lift</Th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((r: TopRiskRow, i) => (
                <motion.tr key={`${by}-${r.key}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{r.label || r.key}</span>
                      {r.low_sample && <Badge tone="neutral">low sample</Badge>}
                    </div>
                  </Td>
                  <Td className="num text-right">{num(r.orders)}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-canvas-3">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, (r.smoothed_rate ?? 0) * 200)}%` }}
                          transition={{ duration: 0.6, delay: i * 0.03 }}
                          className="h-full rounded-full"
                          style={{ background: (r.smoothed_rate ?? 0) > 0.3 ? CHART.high : (r.smoothed_rate ?? 0) > 0.18 ? CHART.med : CHART.low }}
                        />
                      </div>
                      <span className="num w-12 text-right font-medium text-ink">{pct(r.smoothed_rate)}</span>
                    </div>
                  </Td>
                  <Td className="num text-right">{pct(r.observed_rate)}</Td>
                  <Td className="num text-right text-ink-4">{pct(r.benchmark)}</Td>
                  <Td className={cn("num text-right font-medium", (r.lift ?? 1) > 1.2 ? "text-rose-600" : (r.lift ?? 1) < 0.9 ? "text-emerald-600" : "text-ink-2")}>
                    {r.lift != null ? `${r.lift.toFixed(2)}×` : "—"}
                  </Td>
                </motion.tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </Card>
  );
}
