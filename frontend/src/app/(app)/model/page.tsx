"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, BrainCircuit, CheckCircle2, CloudRain, PartyPopper, RefreshCw, Snowflake, Tag } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import type { DriftReport, TrainReport } from "@/lib/types";
import { CHART, cn, fmtDateTime, inrCompact, num, pct } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, ChartTooltip, Empty, ErrorNote, PageHeader, Skeleton, Table, Td, Th } from "@/components/ui";
import { axisProps, ChartCard, fx, gridProps, MetricTile, Note, SkeletonGrid } from "@/components/insights/common";

const BASELINE_LABEL: Record<string, string> = { cod_only: "COD-only rule", pincode_benchmark: "Pincode benchmark" };

export default function ModelPage() {
  const qc = useQueryClient();
  const active = useQuery({ queryKey: ["model-active"], queryFn: api.activeModel });
  const versions = useQuery({ queryKey: ["model-versions"], queryFn: api.modelVersions });
  const drift = useQuery({ queryKey: ["model-drift"], queryFn: api.drift });

  const train = useMutation({
    mutationFn: api.train,
    onSuccess: (r) => {
      toast.success(`Model ${r.version} trained`, { description: `ROC-AUC ${fx(r.metrics?.roc_auc)} · PR-AUC ${fx(r.metrics?.pr_auc)}` });
      qc.invalidateQueries();
    },
    onError: (e) => toast.error("Training failed", { description: e instanceof Error ? e.message : String(e) }),
  });
  const activate = useMutation({
    mutationFn: (v: string) => api.activateModel(v),
    onSuccess: (_, v) => {
      toast.success(`Activated ${v}`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error("Activation failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  const a = active.data;
  const r = a?.report ?? null;

  return (
    <div>
      <PageHeader
        eyebrow="Insights"
        title="Model & drift"
        description="Ranking and calibration on a time-based holdout, the signals that drive risk, and drift since training."
        actions={
          <Button onClick={() => train.mutate()} loading={train.isPending}>
            <RefreshCw size={15} /> Retrain
          </Button>
        }
      />
      {active.error ? <ErrorNote error={active.error} /> : null}

      {/* active strip */}
      <Card className="mb-5 flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <BrainCircuit size={19} />
          </span>
          <div>
            <div className="label">Active version</div>
            <div className="font-mono text-[14px] font-medium text-ink">{active.isLoading ? "…" : a?.version ?? "—"}</div>
          </div>
        </div>
        <Info k="Algorithm" v={r?.algorithm ?? (a?.cold_start ? "Benchmark rules" : "—")} />
        <Info k="Trained" v={fmtDateTime(r?.trained_at)} />
        <Info k="Labelled orders" v={num(a?.n_labelled)} />
        <Info k="Train / test" v={r ? `${num(r.n_train)} / ${num(r.n_test)}` : "—"} />
        <Info k="Split" v={r?.split ?? "—"} />
        <div className="ml-auto">
          {a?.cold_start ? (
            <Badge tone="cyan">
              <Snowflake size={12} /> Cold-start (benchmark prior)
            </Badge>
          ) : a ? (
            <Badge tone="green">
              <CheckCircle2 size={12} /> Seller-trained
            </Badge>
          ) : null}
        </div>
      </Card>

      {active.isLoading ? (
        <div className="space-y-4">
          <SkeletonGrid n={4} />
          <SkeletonGrid n={2} h="h-72" />
        </div>
      ) : r ? (
        <ReportView r={r} />
      ) : (
        <Card className="mb-5">
          <Empty icon={<Snowflake size={18} />} title="No trained model yet" hint="Running on regional benchmarks. Import labelled orders and retrain to see evaluation metrics here." action={<Button onClick={() => train.mutate()} loading={train.isPending}>Train now</Button>} />
        </Card>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_1fr]">
        <DriftPanel data={drift.data} loading={drift.isLoading} error={drift.error} onRetrain={() => train.mutate()} retraining={train.isPending} />
        <Card>
          <CardHeader title="Version history" subtitle="Every training run is kept; roll back any time" />
          <Table className="mt-3 max-h-[440px]">
            <thead>
              <tr>
                <Th>Version</Th>
                <Th>Trained</Th>
                <Th className="text-right">ROC-AUC</Th>
                <Th className="text-right">PR-AUC</Th>
                <Th className="text-right">Brier</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {versions.isLoading && (
                <tr>
                  <Td>
                    <Skeleton className="h-5 w-32" />
                  </Td>
                </tr>
              )}
              {!versions.isLoading && (versions.data ?? []).length === 0 && (
                <tr>
                  <Td className="text-ink-4">No versions yet</Td>
                </tr>
              )}
              {(versions.data ?? []).map((v) => (
                <tr key={v.version} className={cn(v.is_active && "bg-brand-50/40")}>
                  <Td className="font-mono text-[12px] font-medium text-ink">{v.version}</Td>
                  <Td>{fmtDateTime(v.trained_at)}</Td>
                  <Td className="num text-right">{fx(v.metrics?.roc_auc)}</Td>
                  <Td className="num text-right">{fx(v.metrics?.pr_auc)}</Td>
                  <Td className="num text-right">{fx(v.metrics?.brier)}</Td>
                  <Td className="text-right">
                    {v.is_active ? (
                      <Badge tone="brand">Active</Badge>
                    ) : (
                      <Button size="sm" variant="secondary" loading={activate.isPending && activate.variables === v.version} onClick={() => activate.mutate(v.version)}>
                        Activate
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="label">{k}</div>
      <div className="text-[13.5px] font-medium text-ink-2">{v}</div>
    </div>
  );
}

function ReportView({ r }: { r: TrainReport }) {
  const m = r.metrics ?? ({} as TrainReport["metrics"]);
  const b = r.baselines ?? {};
  const baseCmp = (key: "roc_auc" | "pr_auc") => Object.entries(b).map(([k, v]) => ({ label: `vs ${BASELINE_LABEL[k] ?? k}`, value: fx(v?.[key]) }));

  const roc = [...(r.roc_curve ?? [])].sort((x, y) => x.fpr - y.fpr);
  const pr = [...(r.pr_curve ?? [])].sort((x, y) => x.recall - y.recall);
  const cal = (r.calibration ?? []).filter((c) => c.count > 0);
  const calMax = Math.min(1, Math.ceil(Math.max(0.1, ...cal.map((c) => Math.max(c.predicted, c.observed))) * 10) / 10);
  const fi = [...(r.feature_importance ?? [])].sort((x, y) => y.importance - x.importance).slice(0, 12);
  const fiMax = Math.max(...fi.map((f) => f.importance), 1e-9);
  const cost = [...(r.cost_curve ?? [])].sort((x, y) => x.threshold - y.threshold);
  const cm = r.confusion_high;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricTile label="ROC-AUC" value={fx(m.roc_auc)} hint="Ranking quality: probability a random RTO is scored above a random delivery" compare={baseCmp("roc_auc")} tone="good" />
        <MetricTile label="PR-AUC" value={fx(m.pr_auc)} hint="Precision-recall area; base rate is the no-skill line" compare={[...baseCmp("pr_auc"), { label: "No-skill (base rate)", value: fx(r.base_rate) }]} />
        <MetricTile label="Brier score" value={fx(m.brier, 4)} hint="Mean squared error of probabilities — lower is better" compare={[{ label: "Log loss", value: fx(m.log_loss) }]} />
        <MetricTile label="Precision @ high" value={pct(m.precision_high)} hint="Of orders flagged high, share that were truly RTO" compare={[{ label: "@ medium+", value: pct(m.precision_medium) }]} />
        <MetricTile label="Recall @ high" value={pct(m.recall_high)} hint="Share of all RTOs caught by the high tier" compare={[{ label: "@ medium+", value: pct(m.recall_medium) }]} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <ChartCard title="ROC curve" subtitle={`AUC ${fx(m.roc_auc)}`}>
          <div className="h-[240px]">
            <ResponsiveContainer>
              <AreaChart data={roc} margin={{ left: -18, right: 8, top: 4 }}>
                <CartesianGrid {...gridProps} vertical />
                <XAxis type="number" dataKey="fpr" domain={[0, 1]} {...axisProps} tickFormatter={(v) => v.toFixed(1)} />
                <YAxis type="number" domain={[0, 1]} {...axisProps} tickFormatter={(v) => v.toFixed(1)} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke={CHART.axis} strokeDasharray="4 4" />
                <Tooltip content={<ChartTooltip formatter={(v) => v.toFixed(3)} />} />
                <Area type="monotone" dataKey="tpr" name="TPR" stroke={CHART.brand} strokeWidth={1.5} fill={CHART.brand} fillOpacity={0.08} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <AxisCaption x="False positive rate" y="True positive rate" />
        </ChartCard>

        <ChartCard title="Precision–recall" subtitle={`AUC ${fx(m.pr_auc)} · base ${pct(r.base_rate)}`}>
          <div className="h-[240px]">
            <ResponsiveContainer>
              <LineChart data={pr} margin={{ left: -18, right: 8, top: 4 }}>
                <CartesianGrid {...gridProps} vertical />
                <XAxis type="number" dataKey="recall" domain={[0, 1]} {...axisProps} tickFormatter={(v) => v.toFixed(1)} />
                <YAxis type="number" domain={[0, 1]} {...axisProps} tickFormatter={(v) => v.toFixed(1)} />
                <ReferenceLine y={r.base_rate} stroke={CHART.axis} strokeDasharray="4 4" />
                <Tooltip content={<ChartTooltip formatter={(v) => v.toFixed(3)} />} />
                <Line type="monotone" dataKey="precision" name="Precision" stroke={CHART.cyan} strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <AxisCaption x="Recall" y="Precision" />
        </ChartCard>

        <ChartCard title="Calibration" subtitle="Predicted vs observed RTO rate per bin">
          <div className="h-[240px]">
            <ResponsiveContainer>
              <ComposedChart data={cal} margin={{ left: -18, right: 8, top: 4 }}>
                <CartesianGrid {...gridProps} vertical />
                <XAxis type="number" dataKey="predicted" domain={[0, calMax]} {...axisProps} tickFormatter={(v) => pct(v, 0)} />
                <YAxis type="number" domain={[0, calMax]} {...axisProps} tickFormatter={(v) => pct(v, 0)} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: calMax, y: calMax }]} stroke={CHART.axis} strokeDasharray="4 4" />
                <Tooltip content={<ChartTooltip formatter={(v) => pct(v)} />} />
                <Line type="monotone" dataKey="observed" name="Observed" stroke={CHART.brand} strokeWidth={1.5} dot={false} />
                <Scatter dataKey="observed" name="Observed" fill={CHART.brand} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <AxisCaption x="Predicted" y="Observed (dashed = perfect)" />
        </ChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <ChartCard title="What drives risk" subtitle="Global feature importance">
          <div className="space-y-2.5">
            {fi.length === 0 && <div className="text-[13px] text-ink-4">Not available</div>}
            {fi.map((f, i) => (
              <div key={f.feature}>
                <div className="flex justify-between text-[12.5px]">
                  <span className="text-ink-2">{f.label || f.feature}</span>
                  <span className="num text-ink-4">{(f.importance / fiMax).toFixed(2)}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-canvas-3">
                  <motion.div className="h-full rounded-full" style={{ background: i < 3 ? CHART.brand : CHART.brandSoft }} initial={{ width: 0 }} whileInView={{ width: `${(f.importance / fiMax) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, delay: i * 0.03 }} />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Cost curve" subtitle="Threshold vs estimated net savings and share of orders flagged">
          <div className="h-[280px]">
            <ResponsiveContainer>
              <ComposedChart data={cost} margin={{ left: 0, right: 0, top: 10 }}>
                <CartesianGrid {...gridProps} />
                <XAxis type="number" dataKey="threshold" domain={[0, "dataMax"]} {...axisProps} tickFormatter={(v) => pct(v, 0)} />
                <YAxis yAxisId="l" {...axisProps} tickFormatter={(v) => inrCompact(v)} width={60} />
                <YAxis yAxisId="r" orientation="right" domain={[0, 1]} {...axisProps} tickFormatter={(v) => pct(v, 0)} width={40} />
                <Tooltip content={<ChartTooltip formatter={(v, n) => (n === "Net savings" ? inrCompact(v) : pct(v))} />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Area yAxisId="l" type="monotone" dataKey="est_net_savings" name="Net savings" stroke={CHART.low} fill={CHART.low} fillOpacity={0.12} strokeWidth={1.5} />
                <Line yAxisId="r" type="monotone" dataKey="flagged_pct" name="Flagged" stroke={CHART.med} strokeWidth={1.5} dot={false} />
                <Line yAxisId="r" type="monotone" dataKey="rto_caught_pct" name="RTO caught" stroke={CHART.high} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                {r.thresholds?.medium != null && <ReferenceLine yAxisId="l" x={r.thresholds.medium} stroke={CHART.med} strokeDasharray="3 3" label={{ value: "medium", position: "top", fontSize: 10, fill: CHART.med }} />}
                {r.thresholds?.high != null && <ReferenceLine yAxisId="l" x={r.thresholds.high} stroke={CHART.high} strokeDasharray="3 3" label={{ value: "high", position: "top", fontSize: 10, fill: CHART.high }} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {cm && (
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-sm">
              <div className="text-[15px] font-medium text-ink">Confusion matrix @ high threshold</div>
              <p className="mt-1 text-[13px] text-ink-3">On the time-based test set, with orders ≥ {pct(r.thresholds?.high, 0)} treated as “flagged high”. False positives get a nudge, never a cancellation.</p>
            </div>
            <ConfusionMatrix cm={cm} />
          </div>
        </Card>
      )}
    </div>
  );
}

function AxisCaption({ x, y }: { x: string; y: string }) {
  return (
    <div className="mt-1 flex justify-between text-[11px] text-ink-4">
      <span>↑ {y}</span>
      <span>{x} →</span>
    </div>
  );
}

function ConfusionMatrix({ cm }: { cm: TrainReport["confusion_high"] }) {
  const total = cm.tp + cm.fp + cm.tn + cm.fn || 1;
  const cell = (label: string, v: number, good: boolean) => (
    <div className={cn("rounded-xl p-4 text-center ring-1", good ? "bg-emerald-50 ring-emerald-100" : "bg-rose-50/60 ring-rose-100")}>
      <div className="num text-[32px] font-display font-normal text-ink">{num(v)}</div>
      <div className="text-[11px] text-ink-4">
        {label} · {pct(v / total)}
      </div>
    </div>
  );
  return (
    <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-2 text-[12px]">
      <span />
      <span className="text-center font-medium text-ink-3">Predicted high</span>
      <span className="text-center font-medium text-ink-3">Predicted not high</span>
      <span className="pr-2 text-right font-medium text-ink-3">Actual RTO</span>
      {cell("True positive", cm.tp, true)}
      {cell("False negative", cm.fn, false)}
      <span className="pr-2 text-right font-medium text-ink-3">Delivered</span>
      {cell("False positive", cm.fp, false)}
      {cell("True negative", cm.tn, true)}
    </div>
  );
}

const PSI_COLOR = { stable: CHART.low, moderate: CHART.med, drift: CHART.high } as const;

function DriftPanel({ data, loading, error, onRetrain, retraining }: { data?: DriftReport; loading: boolean; error: unknown; onRetrain: () => void; retraining: boolean }) {
  const feats = [...(data?.features ?? [])]
    .sort((a, b) => b.psi - a.psi)
    .slice(0, 12)
    .map((f) => ({ ...f, name: (f as typeof f & { label?: string }).label || f.feature }));
  const overall = data?.overall_psi ?? 0;
  const overallStatus = overall >= 0.2 ? "drift" : overall >= 0.1 ? "moderate" : "stable";
  const s = data?.season;
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Activity size={15} className="text-brand-500" /> Drift monitor
          </span>
        }
        subtitle="Population Stability Index: reference (training) vs recent orders"
        right={data ? <Badge tone={overallStatus === "drift" ? "red" : overallStatus === "moderate" ? "amber" : "green"}>{overallStatus}</Badge> : undefined}
      />
      <div className="px-5 pb-5 pt-4">
        {error ? <ErrorNote error={error} /> : null}
        {loading && <Skeleton className="h-64" />}
        {data && (
          <div className="space-y-4">
            {data.retrain_recommended && (
              <Note tone="red" icon={<AlertTriangle size={15} />}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <b>Retrain recommended.</b>
                    {(data.reasons ?? []).length > 0 && (
                      <ul className="mt-0.5 list-disc pl-4">
                        {data.reasons.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Button size="sm" variant="danger" onClick={onRetrain} loading={retraining}>
                    Retrain now
                  </Button>
                </div>
              </Note>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-canvas-2 p-3 ring-1 ring-line">
                <div className="label">Overall PSI</div>
                <div className="num mt-1 text-[30px] font-display font-normal" style={{ color: PSI_COLOR[overallStatus] }}>
                  {fx(overall)}
                </div>
              </div>
              <div className="rounded-xl bg-canvas-2 p-3 ring-1 ring-line">
                <div className="label">RTO · reference</div>
                <div className="num mt-1 text-[30px] font-display font-normal text-ink">{pct(data.rto_rate_reference)}</div>
              </div>
              <div className="rounded-xl bg-canvas-2 p-3 ring-1 ring-line">
                <div className="label">RTO · current</div>
                <div className={cn("num mt-1 text-[30px] font-display font-normal", (data.rto_rate_current ?? 0) > (data.rto_rate_reference ?? 0) * 1.15 ? "text-rose-600" : "text-ink")}>{pct(data.rto_rate_current)}</div>
              </div>
            </div>
            {s && (
              <div className="flex flex-wrap gap-2">
                <SeasonChip on={s.is_festival_window} icon={<PartyPopper size={12} />} label={s.festival_name ? `Festival: ${s.festival_name}` : "Festival window"} />
                <SeasonChip on={s.is_monsoon} icon={<CloudRain size={12} />} label="Monsoon" />
                <SeasonChip on={s.is_sale_period} icon={<Tag size={12} />} label="Sale period" />
              </div>
            )}
            <div className="h-[260px]">
              {feats.length ? (
                <ResponsiveContainer>
                  <BarChart data={feats} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid {...gridProps} horizontal={false} vertical />
                    <XAxis type="number" {...axisProps} domain={[0, (max: number) => Math.max(0.3, max)]} tickFormatter={(v) => v.toFixed(2)} />
                    <YAxis type="category" dataKey="name" {...axisProps} width={130} />
                    <ReferenceLine x={0.1} stroke={CHART.med} strokeDasharray="3 3" />
                    <ReferenceLine x={0.2} stroke={CHART.high} strokeDasharray="3 3" />
                    <Tooltip cursor={{ fill: CHART.grid }} content={<ChartTooltip formatter={(v) => v.toFixed(3)} />} />
                    <Bar dataKey="psi" name="PSI" radius={[0, 5, 5, 0]} barSize={14}>
                      {feats.map((f) => (
                        <Cell key={f.feature} fill={PSI_COLOR[f.status] ?? CHART.axis} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full place-items-center text-[13px] text-ink-4">No feature drift data</div>
              )}
            </div>
            <div className="flex flex-wrap gap-4 text-[11.5px] text-ink-4">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-risk-low" /> stable &lt; 0.1
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-risk-med" /> moderate 0.1–0.2
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-risk-high" /> drift &gt; 0.2
              </span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function SeasonChip({ on, icon, label }: { on: boolean; icon: React.ReactNode; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset", on ? "bg-amber-50 text-amber-800 ring-amber-100" : "bg-canvas-3 text-ink-4 ring-line")}>
      {icon} {label}
      {on ? " · active" : ""}
    </span>
  );
}
