"use client";
import * as React from "react";
import Link from "next/link";
import { Badge, BlurText, Reveal, Table, Td, Th } from "@/components/ui";
import { SlideWord } from "@/components/shell/sidebar";
import { BIBTEX, DATASETS_GLOBAL, DATASETS_INDIA, PAPERS, RTO_FIGURES, type Dataset, type DatasetStatus } from "@/lib/research-data";
import { cn } from "@/lib/utils";

const wrap = "mx-auto w-full max-w-[1100px] px-5 md:px-10";
const h2 = "font-display text-[clamp(2rem,4vw,3.25rem)] font-normal leading-[1.1] text-ink";
const h3 = "font-display text-[24px] font-normal leading-tight text-ink";
const body = "text-[15px] leading-relaxed text-ink-3";

const STATUS_TONE: Record<DatasetStatus, "green" | "amber" | "neutral"> = {
  downloaded: "green",
  partial: "amber",
  "login required": "neutral",
  "not downloaded": "neutral",
};

function Bars({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[12px] text-ink-4">Not rated</span>;
  return (
    <span className="inline-flex items-center gap-2" aria-label={`Relevance ${value} of 5`}>
      <span className="inline-flex items-end gap-[3px]" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={cn("w-[3px] rounded-[1px]", i <= value ? "bg-brand-500" : "bg-line-2")} style={{ height: 6 + i * 2 }} />
        ))}
      </span>
      <span className="num text-[12px] text-ink-3">{value}/5</span>
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1.5">{label}</div>
      <div className="text-[14px] leading-relaxed text-ink-3">{children}</div>
    </div>
  );
}

function DatasetBlock({ d, n }: { d: Dataset; n: number }) {
  return (
    <Reveal>
      <article className="border-b border-line py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-4">
            <span className="num pt-2 text-[13px] text-ink-4">{String(n).padStart(2, "0")}</span>
            <div>
              <h3 className={h3}>{d.name}</h3>
              <p className="mt-1 text-[13px] text-ink-4">{d.source}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Bars value={d.relevance} />
            <Badge tone={STATUS_TONE[d.status]}>{d.status}</Badge>
          </div>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2 md:pl-9">
          <Field label="Licence">{d.licence}</Field>
          <Field label="Size">{d.size}</Field>
          <Field label="What it offers">{d.offers}</Field>
          <Field label="Mapping to RTO Shield">{d.mapping}</Field>
          <Field label="Limitations">{d.limitations}</Field>
          <Field label="Source">
            <a href={d.url} target="_blank" rel="noopener noreferrer" className="link-draw break-all text-brand-600">
              {d.url}
            </a>
          </Field>
        </div>
      </article>
    </Reveal>
  );
}

function SectionHead({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24 pt-24 md:pt-32">
      <div className="label mb-4 text-brand-500">{eyebrow}</div>
      <h2 className={h2}>
        <BlurText text={title} />
      </h2>
      {children && <div className="mt-5 max-w-[42rem]">{children}</div>}
    </div>
  );
}

const DATASET_PATH = [
  {
    t: "Olist, primary proxy",
    d: "Build a canonical frame (customer_unique_id, zip prefix, payment_value, boleto vs card, category, purchase hour). The label is canceled or unavailable (RTO-like), optionally late by more than N days. Use it to validate pipeline mechanics: leakage-safe pincode and customer target encoding, a time-based split and calibration. The positive rate is only about 1%, so report PR-AUC against the base rate and do not claim Indian accuracy.",
  },
  {
    t: "DataCo, secondary",
    d: "Use Type=CASH as the COD flag and Order Status cancellations and fraud as the label, to test COD, value and category effects. Drop 'Days for shipping (real)' and 'Delivery Status' to avoid leakage, and treat the data as semi-synthetic.",
  },
  {
    t: "UCI Online Retail II, feature prototyping",
    d: "Repeat-customer and cancel-rate history features. It has no payment or geography.",
  },
];

const BENCHMARK_STEPS = [
  { t: "Skeleton", d: "Build the pincode master from the India Post directory (median lat/long, district, state) in place of the hand-typed prefix rows. Keep 3-digit pincode_prefix rows as the fallback level. Add tier from the HRA list (X, Y or Z of the pincode's city; Z by default)." },
  { t: "Priors", d: "No public pincode-level RTO exists. Use a hierarchical prior: COD RTO by tier from ClickPost (metro about 11%, Tier 3 about 24% for COD-heavy brands; prepaid about 3-6%), scaled by the merchant's category band." },
  { t: "Shrinkage", d: "benchmark = (n * observed + k * prior) / (n + k), with k about 30-50 orders. Fall back from pincode to 3-digit prefix to district to tier. Store k in pseudo_count and mark rows source=prior." },
  { t: "Replace with real outcomes", d: "Swap in real merchant outcomes as they accrue. For more public validation, get the Meesho RHP and Delhivery DRHP and mine the Shadowfax 3PL PDF." },
  { t: "Season multipliers", d: "Add festive-peak vs off-peak multipliers of roughly 1.5-1.8x per Unicommerce, from the calendar data." },
  { t: "Fairness", d: "Keep income_band from the development proxies audit-only. Report parity by income band and tier, and cap prefix and pincode prior influence if it proxies income." },
];

const DESIGN_IMPLICATIONS = [
  { t: "Features", d: "Lifetime product and customer return rates, payment type, cart size and geography are the strongest return and failure predictors (01, 04). Compute them only from data matured before the order timestamp. Sparse pincodes need smoothed rates (empirical Bayes); relational aggregates approximate graph signals (02)." },
  { t: "Trainer", d: "Gradient boosting is a strong baseline (01: GBM AUC 71.6, rising to about 80 with feature engineering). With heavy imbalance (03), resampling or weighting distorts probabilities, so always recalibrate. Order-value-weighted or cost-sensitive objectives are optional (12)." },
  { t: "Calibration", d: "Boosted trees are systematically miscalibrated (06). Fit Platt (small data) or isotonic (large data) on a later time slice, and gate releases on Brier, ECE and reliability curves (07)." },
  { t: "Scorer and cold start", d: "Return calibrated probabilities with SHAP reason codes (03) for reviewers. Regional benchmarks fill cold-start pincodes, with the weight shrinking as data accrues." },
  { t: "Policy", d: "Per-order expected-cost thresholds (12) and probability bands (01: High, Medium, Low, with thresholds from the precision-recall curve). Confirmation contact has evidence of reducing not-at-home failures (04); COD restriction and prepaid-style levers appear in 01. Reason-aware routing (05): address problems get WhatsApp confirmation, intent problems get a prepaid nudge." },
  { t: "Impact", d: "A randomised holdout is mandatory for causal claims (08). Report incremental RTO avoided, order loss and net rupees (01: returns -3% against orders -1.7%). Later, move from risk targeting to uplift to target persuadable orders." },
  { t: "Drift and retraining", d: "PSI per feature as a cheap monitor, backed by two-sample tests with multiple-testing correction and a domain classifier (09). Separate label shift (seasonal RTO rate) from covariate shift. Monitor ECE on matured outcomes (07), and retrain or recalibrate on trigger." },
  { t: "Fairness", d: "Geography is a top predictor (04) and a proxy for protected groups (11), so removing protected attributes is insufficient. Audit error rates and intervention burden per region (10), report per-region calibration, prefer low-friction interventions (confirmation) over denying COD, and document the cost-benefit rationale (11)." },
];

function CopyBibtex() {
  const [done, setDone] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(BIBTEX);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      setDone(false);
    }
  };
  return (
    <button onClick={copy} className="inline-flex h-9 items-center rounded-full border border-line-2 px-4 text-[13px] text-ink-2 transition-colors duration-200 hover:border-ink-4">
      {done ? "Copied" : "Copy BibTeX"}
    </button>
  );
}

export default function ResearchPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-line bg-cream">
        <div className={cn(wrap, "flex h-[72px] items-center justify-between")}>
          <Link href="/" className="group" aria-label="RTO Shield home">
            <SlideWord text="RTO SHIELD" />
          </Link>
          <Link href="/dashboard" className="link-draw text-[14px] text-ink-2">
            Back to dashboard
          </Link>
        </div>
      </header>

      <main className={cn(wrap, "pb-32")}>
        <div className="pt-20 md:pt-28">
          <div className="label mb-4 text-brand-500">Research notes</div>
          <h1 className="max-w-[16ch] font-display text-[clamp(2.75rem,6vw,4.75rem)] font-normal leading-[1.05] text-ink">
            <BlurText text="What the design rests on" />
          </h1>
          <p className={cn(body, "mt-6 max-w-[42rem]")}>
            Public datasets, Indian data sources and twelve open-access papers behind RTO Shield, with licences and access status as recorded. No public dataset has an Indian COD RTO label, and no open paper on Indian COD RTO prediction was found.
          </p>
          <nav className="mt-8 flex flex-wrap gap-x-8 gap-y-2 text-[14px] text-ink-2">
            {[
              ["Datasets", "#datasets"],
              ["India data", "#india"],
              ["Benchmark rebuild", "#benchmarks"],
              ["Published figures", "#figures"],
              ["Papers", "#papers"],
              ["Design implications", "#implications"],
              ["BibTeX", "#bibtex"],
            ].map(([l, h]) => (
              <a key={h} href={h} className="link-draw">
                {l}
              </a>
            ))}
          </nav>
        </div>

        {/* Datasets */}
        <SectionHead id="datasets" eyebrow="01 Global datasets" title="Public datasets as proxies">
          <p className={body}>Nine public datasets, none with a true COD RTO label or Indian pincodes. Relevance is the 1 to 5 rating from our notes.</p>
        </SectionHead>
        <Reveal className="mt-12">
          <div className="label mb-3">Recommended path</div>
          <ol className="border-t border-line">
            {DATASET_PATH.map((s, i) => (
              <li key={s.t} className="grid grid-cols-[2.5rem_1fr] gap-x-4 border-b border-line py-5">
                <span className="num pt-1 text-[13px] text-ink-4">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className={h3}>{s.t}</h3>
                  <p className={cn(body, "mt-2")}>{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className={cn(body, "mt-6")}>
            Final models must be calibrated and primed with India benchmark data (pincode RTO rates, a 25-30% COD base rate) and real seller data through the cold-start blend. These public sets cannot supply Indian COD base rates.
          </p>
          <p className={cn(body, "mt-3")}>
            Licences: Olist CC BY-NC-SA and Amazon Last Mile CC BY-NC mean research and validation only. DataCo and UCI are CC BY 4.0. LaDe is tagged Apache-2.0.
          </p>
        </Reveal>
        <div className="mt-12 border-t border-line">
          {DATASETS_GLOBAL.map((d, i) => (
            <DatasetBlock key={d.id} d={d} n={i + 1} />
          ))}
        </div>

        {/* India */}
        <SectionHead id="india" eyebrow="02 India data" title="Indian public data">
          <p className={body}>Six sources that supply the pincode master, tiers, fairness-audit bands, benchmark priors and seasonality. Only the delivery-time set carries a relevance rating in our notes.</p>
        </SectionHead>
        <div className="mt-12 border-t border-line">
          {DATASETS_INDIA.map((d, i) => (
            <DatasetBlock key={d.id} d={d} n={i + 1} />
          ))}
        </div>

        <SectionHead id="benchmarks" eyebrow="03 Benchmark rebuild" title="Rebuilding the pincode benchmarks">
          <p className={body}>The recommendation for replacing the hand-typed pincode_benchmarks.csv with public data.</p>
        </SectionHead>
        <Reveal className="mt-10">
          <ol className="border-t border-line">
            {BENCHMARK_STEPS.map((s, i) => (
              <li key={s.t} className="grid grid-cols-[2.5rem_1fr] gap-x-4 border-b border-line py-5">
                <span className="num pt-1 text-[13px] text-ink-4">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className={h3}>{s.t}</h3>
                  <p className={cn(body, "mt-2")}>{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>

        <SectionHead id="figures" eyebrow="04 Published figures" title="Published RTO figures">
          <p className={body}>There is no official national RTO rate. Definitions differ between RTO, failed delivery and return, so vendor figures are directional. State-level RTO rates are not published.</p>
        </SectionHead>
        <Reveal className="mt-10">
          <div className="border-t border-line">
            <Table>
              <thead>
                <tr>
                  <Th>Figure</Th>
                  <Th>Value</Th>
                  <Th>Source</Th>
                  <Th>Year</Th>
                  <Th>Confidence</Th>
                </tr>
              </thead>
              <tbody>
                {RTO_FIGURES.map((f) => (
                  <tr key={f.figure + f.source}>
                    <Td className="min-w-[240px] whitespace-normal text-ink">{f.figure}</Td>
                    <Td className="min-w-[200px] whitespace-normal font-display text-[18px] text-ink">{f.value}</Td>
                    <Td className="min-w-[180px] whitespace-normal text-ink-3">{f.source}</Td>
                    <Td className="text-ink-3">{f.year}</Td>
                    <Td className="min-w-[220px] whitespace-normal text-[12.5px] text-ink-4">{f.confidence}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Reveal>

        {/* Papers */}
        <SectionHead id="papers" eyebrow="05 Papers" title="Twelve open-access papers">
          <p className={body}>
            Papers 01 to 05 are about returns or delivery-failure prediction; 01 is from Myntra, India. No open paper specifically on Indian COD RTO prediction was found, only vendor blog posts (Delhivery, Razorpay, Cashfree), which are not included.
          </p>
        </SectionHead>
        <div className="mt-12 border-t border-line">
          {PAPERS.map((p) => (
            <Reveal key={p.number}>
              <article className="border-b border-line py-8">
                <div className="grid grid-cols-[2.5rem_1fr] gap-x-4">
                  <span className="num pt-2 text-[13px] text-ink-4">{p.number}</span>
                  <div>
                    <h3 className="font-display text-[26px] font-normal leading-tight text-ink">{p.title}</h3>
                    <p className="mt-1.5 text-[13px] text-ink-3">
                      {p.authors} · {p.year} · {p.venue}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{p.topic}</Badge>
                      {p.openAccess && <Badge tone="green">open access</Badge>}
                      <Badge tone={p.depth === "read" ? "brand" : "amber"}>{p.depth === "read" ? "detailed summary" : "abstract-level summary"}</Badge>
                    </div>
                    <div className="mt-6 grid gap-6 md:grid-cols-2">
                      <div>
                        <div className="label mb-2">Key findings</div>
                        <ul className="space-y-2 text-[14px] leading-relaxed text-ink-3">
                          {p.findings.map((f) => (
                            <li key={f} className="flex gap-3">
                              <span aria-hidden className="mt-[10px] h-px w-3 shrink-0 bg-ink-4" />
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="label mb-2">Applied in RTO Shield</div>
                        <p className="text-[14px] leading-relaxed text-ink-3">{p.applied}</p>
                        <p className="mt-3 text-[12.5px] text-ink-4">Module: {p.module}</p>
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="link-draw mt-4 inline-block break-all text-[13px] text-brand-600">
                          {p.url}
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <SectionHead id="implications" eyebrow="06 Design implications" title="What the papers change in the build" />
        <Reveal className="mt-10">
          <ul className="border-t border-line">
            {DESIGN_IMPLICATIONS.map((s) => (
              <li key={s.t} className="grid gap-x-8 gap-y-2 border-b border-line py-5 md:grid-cols-[12rem_1fr]">
                <h3 className={h3}>{s.t}</h3>
                <p className={body}>{s.d}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12.5px] text-ink-4">Numbers in brackets are paper numbers from the list above.</p>
        </Reveal>

        <SectionHead id="bibtex" eyebrow="07 Citations" title="BibTeX" />
        <Reveal className="mt-8">
          <div className="mb-3 flex justify-end">
            <CopyBibtex />
          </div>
          <pre data-lenis-prevent className="scroll-thin max-h-[480px] overflow-auto rounded-2xl border border-line bg-cream p-5 text-[12px] leading-relaxed text-ink-2">
            <code>{BIBTEX}</code>
          </pre>
        </Reveal>
      </main>
    </div>
  );
}
