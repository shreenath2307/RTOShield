"use client";
import * as React from "react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CloudUpload,
  Database,
  FileSpreadsheet,
  Rocket,
  ShoppingBag,
  Snowflake,
  Store,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import type { IngestResult, TrainReport } from "@/lib/types";
import { CHART, cn, num, pct } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, ChartTooltip, ErrorNote, PageHeader, Table, Td, Th } from "@/components/ui";
import { axisProps, gridProps, Note } from "@/components/insights/common";

type Source = "csv" | "shopify" | "woo" | "demo" | "cold";
const STEPS = ["Connect data", "Data quality", "Train model", "Results"];

const SOURCES: { id: Source; title: string; desc: string; icon: React.ElementType }[] = [
  { id: "csv", title: "Upload CSV", desc: "Shopify, WooCommerce or Shiprocket export", icon: FileSpreadsheet },
  { id: "shopify", title: "Shopify", desc: "Sync orders with an Admin API token", icon: ShoppingBag },
  { id: "woo", title: "WooCommerce", desc: "REST API consumer key & secret", icon: Store },
  { id: "demo", title: "Load demo data", desc: "8,000 realistic synthetic orders + training", icon: Sparkles },
  { id: "cold", title: "Start in cold-start mode", desc: "Use regional benchmarks until your data accumulates", icon: Snowflake },
];

const CSV_COLUMNS: [string, string, string][] = [
  ["order_id", "required", "Unique order reference"],
  ["order_date", "required", "Date/time the order was placed"],
  ["customer_id", "recommended", "Phone or email works too — used for repeat history"],
  ["pincode", "required", "6-digit Indian PIN code"],
  ["city, state, address", "optional", "Improves address-quality signals"],
  ["order_value", "required", "Order total in INR"],
  ["payment_method", "required", "COD / Prepaid (cod, cash on delivery, razorpay… all mapped)"],
  ["product_category, sku, quantity", "recommended", "Category effects are strong predictors"],
  ["channel", "optional", "shopify / woocommerce / whatsapp / instagram / website"],
  ["outcome", "required to train", "Delivered / RTO (Returned, RTO Delivered… all mapped)"],
];

export default function OnboardingPage() {
  const qc = useQueryClient();
  const [step, setStep] = React.useState(0);
  const [source, setSource] = React.useState<Source | null>(null);
  const [ingest, setIngest] = React.useState<IngestResult | null>(null);
  const [report, setReport] = React.useState<TrainReport | null>(null);
  const [coldMode, setColdMode] = React.useState(false);

  const onIngested = (r: IngestResult) => {
    setIngest(r);
    if (r.train_report) setReport(r.train_report);
    setColdMode(false);
    qc.invalidateQueries();
    toast.success(`Imported ${num(r.rows_imported)} orders`, { description: `${num(r.labelled_rows)} with delivery outcome` });
    setStep(1);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Setup" title="Connect your data" description="Import past orders, check data quality and train a model on your store. Or start with regional benchmarks." />
      <Stepper step={step} onJump={(i) => i < step && setStep(i)} />
      <LayoutGroup>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="mt-8">
            {step === 0 && (
              <StepSource
                source={source}
                setSource={setSource}
                onIngested={onIngested}
                onCold={() => {
                  setColdMode(true);
                  setIngest(null);
                  setReport(null);
                  setStep(3);
                }}
              />
            )}
            {step === 1 && ingest && <StepQuality ingest={ingest} onBack={() => setStep(0)} onNext={() => setStep(2)} />}
            {step === 2 && (
              <StepTrain
                existing={report}
                labelled={ingest?.labelled_rows ?? 0}
                onTrained={(r) => {
                  setReport(r);
                  qc.invalidateQueries();
                  setStep(3);
                }}
                onBack={() => setStep(1)}
                onSkip={() => setStep(3)}
              />
            )}
            {step === 3 && <StepResults report={report} cold={coldMode || !report} onRestart={() => setStep(0)} />}
          </motion.div>
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );
}

/* ---------------------------------------------------------------- stepper */
function Stepper({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto pb-1">
      {STEPS.map((s, i) => {
        const done = i < step;
        const cur = i === step;
        return (
          <li key={s} className="flex min-w-0 flex-1 items-center gap-2">
            <button onClick={() => onJump(i)} className={cn("flex min-w-0 items-center gap-2.5 rounded-xl px-1 py-1 text-left", done && "cursor-pointer")}>
              <span className={cn("relative grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-medium transition", done ? "bg-ink text-white" : cur ? "bg-brand-500 text-white" : "bg-canvas-3 text-ink-4")}>
                {done ? <Check size={14} /> : i + 1}
                {cur && <motion.span layoutId="step-ring" className="absolute -inset-1 rounded-full ring-2 ring-brand-200" />}
              </span>
              <span className={cn("truncate text-[13px] font-medium", cur ? "text-ink" : "text-ink-4")}>{s}</span>
            </button>
            {i < STEPS.length - 1 && (
              <span className="h-px min-w-4 flex-1 bg-line">
                <motion.span className="block h-full bg-ink" initial={false} animate={{ width: done ? "100%" : "0%" }} transition={{ duration: 0.4 }} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------------------------------------- step 1: source */
function StepSource({ source, setSource, onIngested, onCold }: { source: Source | null; setSource: (s: Source) => void; onIngested: (r: IngestResult) => void; onCold: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<unknown>(null);
  const run = async (fn: () => Promise<IngestResult>) => {
    setBusy(true);
    setErr(null);
    try {
      onIngested(await fn());
    } catch (e) {
      setErr(e);
      toast.error("Import failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        {SOURCES.map((s) => {
          const open = source === s.id;
          return (
            <motion.div layout key={s.id} className={cn("overflow-hidden rounded-2xl border bg-white transition-colors", open ? "border-brand-200" : "border-line hover:border-line-2")}>
              <motion.button layout="position" onClick={() => setSource(s.id)} className="flex w-full items-center gap-4 p-4 text-left sm:p-5">
                <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl transition", open ? "bg-brand-500 text-white" : "bg-canvas-3 text-ink-3")}>
                  <s.icon size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-medium text-ink">{s.title}</span>
                  <span className="block text-[13px] text-ink-3">{s.desc}</span>
                </span>
                <span className={cn("grid h-5 w-5 place-items-center rounded-full border transition", open ? "border-brand-500 bg-brand-500 text-white" : "border-line-2")}>{open && <Check size={12} />}</span>
              </motion.button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
                    <div className="border-t border-line px-4 pb-5 pt-4 sm:px-5">
                      {s.id === "csv" && <CsvForm busy={busy} onSubmit={(f) => run(() => api.ingestCsv(f))} />}
                      {s.id === "shopify" && <ShopifyForm busy={busy} onSubmit={(u, t) => run(() => api.shopifySync(u, t))} />}
                      {s.id === "woo" && <WooForm busy={busy} onSubmit={(u, k, sec) => run(() => api.wooSync(u, k, sec))} />}
                      {s.id === "demo" && (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="max-w-md text-[13px] text-ink-3">Generates ~13 months of orders with realistic COD, pincode-tier, festival and monsoon effects, imports them and trains a model. Takes ~10–30 seconds.</p>
                          <Button loading={busy} onClick={() => run(() => api.ingestDemo(8000, true))}>
                            <Database size={15} /> Load demo data
                          </Button>
                        </div>
                      )}
                      {s.id === "cold" && (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="max-w-md text-[13px] text-ink-3">Scores use regional pincode benchmarks + transparent rules. The model blends in your own outcomes as they arrive (w = n/(n+500)).</p>
                          <Button variant="secondary" onClick={onCold}>
                            Continue in cold-start <ArrowRight size={15} />
                          </Button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
        {err != null && <ErrorNote error={err} />}
      </div>
      <CsvFormatPanel />
    </div>
  );
}

function CsvForm({ busy, onSubmit }: { busy: boolean; onSubmit: (f: File) => void }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [drag, setDrag] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) setFile(f);
        }}
        onClick={() => input.current?.click()}
        className={cn("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition", drag ? "border-brand-400 bg-brand-50" : "border-line-2 bg-canvas-2 hover:bg-canvas-3")}
      >
        <motion.div animate={{ y: drag ? -4 : 0 }} className="grid h-11 w-11 place-items-center rounded-xl bg-white text-brand-500">
          <CloudUpload size={20} />
        </motion.div>
        {file ? (
          <div className="mt-3 text-[13.5px] font-medium text-ink">
            {file.name} <span className="font-normal text-ink-4">· {(file.size / 1024).toFixed(0)} KB</span>
          </div>
        ) : (
          <>
            <div className="mt-3 text-[13.5px] font-medium text-ink">Drop your orders CSV here</div>
            <div className="text-[12.5px] text-ink-4">or click to browse · .csv up to ~50 MB</div>
          </>
        )}
        <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="mt-3 flex justify-end">
        <Button disabled={!file} loading={busy} onClick={() => file && onSubmit(file)}>
          Upload & analyse <ArrowRight size={15} />
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium text-ink-2">{label}</span>
      {children}
    </label>
  );
}

function ShopifyForm({ busy, onSubmit }: { busy: boolean; onSubmit: (u: string, t: string) => void }) {
  const [u, setU] = React.useState("");
  const [t, setT] = React.useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(u, t);
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <Field label="Store URL">
        <input className="input" placeholder="your-store.myshopify.com" value={u} onChange={(e) => setU(e.target.value)} required />
      </Field>
      <Field label="Admin API access token">
        <input className="input" type="password" placeholder="shpat_…" value={t} onChange={(e) => setT(e.target.value)} required />
      </Field>
      <div className="flex items-center justify-between gap-3 sm:col-span-2">
        <span className="text-[12px] text-ink-4">Needs read_orders scope. Token is used only for this sync.</span>
        <Button type="submit" loading={busy}>
          Sync orders <ArrowRight size={15} />
        </Button>
      </div>
    </form>
  );
}

function WooForm({ busy, onSubmit }: { busy: boolean; onSubmit: (u: string, k: string, s: string) => void }) {
  const [u, setU] = React.useState("");
  const [k, setK] = React.useState("");
  const [s, setS] = React.useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(u, k, s);
      }}
      className="grid gap-3 sm:grid-cols-3"
    >
      <Field label="Store URL">
        <input className="input" placeholder="https://shop.example.in" value={u} onChange={(e) => setU(e.target.value)} required />
      </Field>
      <Field label="Consumer key">
        <input className="input" placeholder="ck_…" value={k} onChange={(e) => setK(e.target.value)} required />
      </Field>
      <Field label="Consumer secret">
        <input className="input" type="password" placeholder="cs_…" value={s} onChange={(e) => setS(e.target.value)} required />
      </Field>
      <div className="flex justify-end sm:col-span-3">
        <Button type="submit" loading={busy}>
          Sync orders <ArrowRight size={15} />
        </Button>
      </div>
    </form>
  );
}

function CsvFormatPanel() {
  const [open, setOpen] = React.useState(false);
  return (
    <Card className="h-fit overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 p-5 text-left">
        <div>
          <div className="text-[14px] font-medium text-ink">CSV format</div>
          <div className="text-[12.5px] text-ink-3">Expected columns & sample files</div>
        </div>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-ink-4">
          <ChevronDown size={18} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="space-y-2.5 border-t border-line px-5 py-4">
              {CSV_COLUMNS.map(([c, req, d]) => (
                <div key={c}>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-[12px] text-ink">{c}</code>
                    <Badge tone={req.startsWith("required") ? "brand" : req === "recommended" ? "cyan" : "neutral"}>{req}</Badge>
                  </div>
                  <div className="text-[12px] text-ink-4">{d}</div>
                </div>
              ))}
              <Note className="mt-3">
                Headers are fuzzy-matched, so raw Shopify / WooCommerce / Shiprocket exports work as-is. Sample files live in <code className="font-mono text-[11.5px]">backend/sample_data/</code>.
              </Note>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!open && <div className="px-5 pb-5 text-[12.5px] text-ink-4">Minimum: order id, date, pincode, value, payment method — plus outcome to train.</div>}
    </Card>
  );
}

/* ---------------------------------------------------------------- step 2: quality */
function StepQuality({ ingest, onBack, onNext }: { ingest: IngestResult; onBack: () => void; onNext: () => void }) {
  const r = ingest.report;
  const missing = Object.entries(r?.missing_by_column ?? {})
    .map(([col, n]) => ({ col, n, pct: r?.rows_in ? n / r.rows_in : 0 }))
    .sort((a, b) => b.n - a.n);
  const outcome = Object.entries(r?.outcome_distribution ?? {}).map(([k, v]) => ({ k, v }));
  const outcomeTotal = outcome.reduce((a, o) => a + o.v, 0) || 1;
  const outColor = (k: string) => (k === "RTO" ? CHART.high : k === "DELIVERED" ? CHART.low : CHART.axis);
  const keep = r?.rows_in ? r.rows_out / r.rows_in : 0;
  const mapEntries = Object.entries(ingest.column_map ?? {});

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <div className="label">Detected format</div>
          <div className="mt-3 text-[32px] font-display font-normal capitalize text-ink">{ingest.source_format || "unknown"}</div>
          <div className="mt-1 text-[12px] text-ink-4">{mapEntries.length} columns mapped</div>
        </Card>
        <Card className="p-5">
          <div className="label">Rows in → out</div>
          <div className="num mt-3 text-[32px] font-display font-normal text-ink">
            {num(r?.rows_in)} <span className="text-ink-4">→</span> {num(r?.rows_out)}
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-canvas-3">
            <motion.div className="h-full rounded-full bg-emerald-500" initial={{ width: 0 }} animate={{ width: `${keep * 100}%` }} transition={{ duration: 0.9 }} />
          </div>
        </Card>
        <Card className="p-5">
          <div className="label">Labelled rows</div>
          <div className="num mt-3 text-[32px] font-display font-normal text-ink">{num(ingest.labelled_rows)}</div>
          <div className="mt-1 text-[12px] text-ink-4">{ingest.labelled_rows >= 200 ? "Enough to train" : "Need ≥ 200 to train"}</div>
        </Card>
        <Card className="p-5">
          <div className="label">Date range</div>
          <div className="mt-3 text-[14px] font-medium text-ink">
            {r?.date_range ? `${new Date(r.date_range[0]).toLocaleDateString("en-IN", { month: "short", year: "numeric" })} – ${new Date(r.date_range[1]).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}` : "—"}
          </div>
          <div className="mt-1 text-[12px] text-ink-4">Dropped: {num(r?.dropped_count)} rows</div>
        </Card>
      </div>

      {(r?.warnings?.length ?? 0) > 0 && (
        <Note tone="amber" icon={<AlertTriangle size={15} />}>
          <ul className="space-y-0.5">
            {r.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Note>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Column mapping" subtitle="Raw header → canonical field" />
          <Table className="mt-3 max-h-[320px]">
            <thead>
              <tr>
                <Th>Raw column</Th>
                <Th />
                <Th>Canonical</Th>
              </tr>
            </thead>
            <tbody>
              {mapEntries.length === 0 && (
                <tr>
                  <Td className="text-ink-4">No mapping reported</Td>
                </tr>
              )}
              {mapEntries.map(([raw, canon]) => (
                <tr key={raw}>
                  <Td className="font-mono text-[12px]">{raw}</Td>
                  <Td className="text-ink-5">→</Td>
                  <Td>
                    <Badge tone="brand">{canon}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Missing values by column" subtitle="Share of input rows with empty values" />
          <div className="space-y-2.5 px-5 pb-5 pt-4">
            {missing.length === 0 && <div className="text-[13px] text-ink-4">No missing values 🎉</div>}
            {missing.slice(0, 10).map((m) => (
              <div key={m.col}>
                <div className="flex justify-between text-[12.5px]">
                  <span className="font-mono text-ink-2">{m.col}</span>
                  <span className="num text-ink-4">
                    {num(m.n)} · {pct(m.pct)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-canvas-3">
                  <motion.div className={cn("h-full rounded-full", m.pct > 0.3 ? "bg-rose-400" : m.pct > 0.05 ? "bg-amber-400" : "bg-emerald-400")} initial={{ width: 0 }} animate={{ width: `${Math.max(1, m.pct * 100)}%` }} transition={{ duration: 0.8 }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Outcome distribution" subtitle="Delivered vs RTO vs not yet known" />
          <div className="h-[200px] px-3 pb-4 pt-2">
            {outcome.length ? (
              <ResponsiveContainer>
                <BarChart data={outcome} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid {...gridProps} horizontal={false} vertical />
                  <XAxis type="number" {...axisProps} />
                  <YAxis type="category" dataKey="k" {...axisProps} width={80} />
                  <Tooltip cursor={{ fill: CHART.grid }} content={<ChartTooltip formatter={(v) => `${num(v)} (${pct(v / outcomeTotal)})`} />} />
                  <Bar dataKey="v" name="Orders" radius={[0, 6, 6, 0]} barSize={22}>
                    {outcome.map((o) => (
                      <Cell key={o.k} fill={outColor(o.k)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-[13px] text-ink-4">No outcome column</div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Dropped rows" subtitle={`${num(r?.dropped_count)} rows removed (first 50 shown)`} />
          <Table className="mt-3 max-h-[220px]">
            <thead>
              <tr>
                <Th>Row</Th>
                <Th>Reason</Th>
              </tr>
            </thead>
            <tbody>
              {(r?.dropped ?? []).length === 0 && (
                <tr>
                  <Td className="text-ink-4">None</Td>
                  <Td />
                </tr>
              )}
              {(r?.dropped ?? []).map((d, i) => (
                <tr key={i}>
                  <Td className="num">{d.row}</Td>
                  <Td className="whitespace-normal">{d.reason}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={15} /> Back
        </Button>
        <Button onClick={onNext}>
          Continue to training <ArrowRight size={15} />
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- step 3: train */
const TRAIN_STAGES = [
  { t: "Feature engineering", d: "Leakage-safe customer & pincode history, time-of-day, value bands, season flags" },
  { t: "Time-based split", d: "Last 20% of orders by date held out as the test set" },
  { t: "Gradient boosting", d: "Fitting boosted trees on the training window" },
  { t: "Calibration", d: "Isotonic calibration so 30% means 30%" },
  { t: "Evaluation", d: "ROC-AUC, PR-AUC, Brier vs COD-only and pincode baselines" },
];

function StepTrain({ existing, labelled, onTrained, onBack, onSkip }: { existing: TrainReport | null; labelled: number; onTrained: (r: TrainReport) => void; onBack: () => void; onSkip: () => void }) {
  const [stage, setStage] = React.useState(-1);
  const [err, setErr] = React.useState<unknown>(null);
  const running = stage >= 0 && stage < TRAIN_STAGES.length;

  const start = async () => {
    setErr(null);
    setStage(0);
    let s = 0;
    const timer = setInterval(() => {
      s = Math.min(s + 1, TRAIN_STAGES.length - 1);
      setStage(s);
    }, 1400);
    try {
      const r = await api.train();
      clearInterval(timer);
      for (let i = s + 1; i <= TRAIN_STAGES.length; i++) {
        setStage(i);
        await new Promise((res) => setTimeout(res, 260));
      }
      toast.success(`Model ${r.version} trained`, { description: `ROC-AUC ${r.metrics?.roc_auc?.toFixed(3) ?? "—"}` });
      setTimeout(() => onTrained(r), 500);
    } catch (e) {
      clearInterval(timer);
      setStage(-1);
      setErr(e);
      toast.error("Training failed", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-[28px] leading-tight text-ink">Train your risk model</h2>
            <p className="mt-1 max-w-md text-[13.5px] text-ink-3">Uses {num(labelled)} labelled orders. Gradient boosting with calibrated probabilities, evaluated on a time-based holdout.</p>
          </div>
          <Button size="lg" loading={running} onClick={start}>
            <Rocket size={16} /> {existing ? "Retrain" : "Start training"}
          </Button>
        </div>
        <ol className="mt-8 space-y-1">
          {TRAIN_STAGES.map((s, i) => {
            const done = stage > i;
            const cur = stage === i;
            return (
              <motion.li key={s.t} layout className={cn("flex gap-4 rounded-xl px-3 py-3 transition", cur && "bg-brand-50/60")}>
                <span className={cn("relative mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-medium", done ? "bg-emerald-500 text-white" : cur ? "bg-ink text-white" : "bg-canvas-3 text-ink-4")}>
                  {done ? <Check size={13} /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={cn("text-[14px] font-medium", done || cur ? "text-ink" : "text-ink-4")}>{s.t}</div>
                  <div className="text-[12.5px] text-ink-4">{s.d}</div>
                  {cur && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-brand-100">
                      <motion.div className="h-full w-1/3 rounded-full bg-brand-500" animate={{ x: ["-100%", "300%"] }} transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }} />
                    </div>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ol>
        {err != null && (
          <div className="mt-4">
            <ErrorNote error={err} />
          </div>
        )}
      </Card>
      <div className="space-y-4">
        {existing && (
          <Note tone="green" icon={<Check size={15} />}>
            A model (<b>{existing.version}</b>) was already trained during import. You can continue, or retrain.
          </Note>
        )}
        {labelled < 200 && (
          <Note tone="amber" icon={<AlertTriangle size={15} />}>
            Fewer than 200 labelled orders — training will likely fail. Continue in cold-start mode and the model will blend in your data as outcomes arrive.
          </Note>
        )}
        <div className="flex flex-col gap-2">
          {existing && (
            <Button variant="secondary" onClick={() => onTrained(existing)} disabled={running}>
              Use existing model <ArrowRight size={15} />
            </Button>
          )}
          <Button variant="ghost" onClick={onSkip} disabled={running}>
            Skip — stay in cold-start
          </Button>
          <Button variant="ghost" onClick={onBack} disabled={running}>
            <ArrowLeft size={15} /> Back
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- step 4: results */
function StepResults({ report, cold, onRestart }: { report: TrainReport | null; cold: boolean; onRestart: () => void }) {
  if (cold || !report) {
    return (
      <Card className="p-8 text-center sm:p-12">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-50 text-cyan-600">
          <Snowflake size={24} />
        </div>
        <h2 className="mt-5 font-display text-[32px] text-ink">You're in cold-start mode</h2>
        <p className="mx-auto mt-2 max-w-lg text-[14px] text-ink-3">
          Orders are scored from regional RTO benchmarks for each pincode prefix plus transparent rules (COD, order value, time of day, address quality). Every outcome you record sharpens it; retrain once you have 200+ labelled orders.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/dashboard">
            <Button size="lg">
              Open dashboard <ArrowRight size={16} />
            </Button>
          </Link>
          <Button size="lg" variant="secondary" onClick={onRestart}>
            Import data instead
          </Button>
        </div>
      </Card>
    );
  }
  const m = report.metrics ?? ({} as TrainReport["metrics"]);
  const b = report.baselines ?? {};
  const chart = [
    { name: "RTO Shield", roc: m.roc_auc, pr: m.pr_auc },
    ...Object.entries(b).map(([k, v]) => ({ name: k === "cod_only" ? "COD-only rule" : k === "pincode_benchmark" ? "Pincode benchmark" : k, roc: v?.roc_auc, pr: v?.pr_auc })),
  ];
  return (
    <div className="space-y-5">
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500 text-white">
              <Check size={22} />
            </motion.div>
            <div>
              <h2 className="font-display text-[30px] leading-tight text-ink">Model {report.version} is live</h2>
              <p className="text-[13px] text-ink-3">
                {report.algorithm} · trained on {num(report.n_train)} · tested on {num(report.n_test)} ({report.split}) · base RTO rate {pct(report.base_rate)}
              </p>
            </div>
          </div>
          <Link href="/dashboard">
            <Button size="lg">
              Go to dashboard <ArrowRight size={16} />
            </Button>
          </Link>
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["ROC-AUC", m.roc_auc?.toFixed(3) ?? "—"],
          ["PR-AUC", m.pr_auc?.toFixed(3) ?? "—"],
          ["Precision @ high", pct(m.precision_high)],
          ["Recall @ high", pct(m.recall_high)],
        ].map(([k, v]) => (
          <Card key={k} className="p-5">
            <div className="label">{k}</div>
            <div className="num mt-3 text-[38px] font-display font-normal text-ink">{v}</div>
          </Card>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="vs. baselines" subtitle="Higher is better · same time-based test set" />
          <div className="h-[260px] px-3 pb-4 pt-3">
            <ResponsiveContainer>
              <BarChart data={chart} margin={{ left: -10, right: 10 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis domain={[0, 1]} {...axisProps} />
                <Tooltip cursor={{ fill: CHART.grid }} content={<ChartTooltip formatter={(v) => v?.toFixed?.(3) ?? String(v)} />} />
                <Bar dataKey="roc" name="ROC-AUC" fill={CHART.brand} radius={[6, 6, 0, 0]} barSize={26} />
                <Bar dataKey="pr" name="PR-AUC" fill={CHART.brandSoft} radius={[6, 6, 0, 0]} barSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-[15px] font-medium text-ink">Suggested thresholds</div>
          <p className="mt-0.5 text-[13px] text-ink-3">Chosen to maximise expected net savings on the test set.</p>
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-risk-medbg px-4 py-3">
              <span className="text-[13px] font-medium text-amber-800">Medium ≥</span>
              <span className="num text-[30px] font-display font-normal text-amber-700">{pct(report.thresholds?.medium, 0)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-risk-highbg px-4 py-3">
              <span className="text-[13px] font-medium text-rose-800">High ≥</span>
              <span className="num text-[30px] font-display font-normal text-rose-700">{pct(report.thresholds?.high, 0)}</span>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <Link href="/settings">
              <Button variant="secondary" className="w-full">
                Adjust in settings
              </Button>
            </Link>
            <Link href="/model">
              <Button variant="ghost" className="w-full">
                Full model report <ArrowRight size={15} />
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
