"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Badge, BlurText, Reveal, Segmented, Table, Td, Th } from "@/components/ui";
import { DATASETS_GLOBAL, DATASETS_INDIA, PAPERS, RTO_FIGURES, type Dataset, type DatasetStatus } from "@/lib/research-data";
import { cn } from "@/lib/utils";

const wrap = "mx-auto w-full max-w-[1240px] px-5 md:px-10";
const h2 = "max-w-[18ch] font-display text-[clamp(2.4rem,5vw,4.25rem)] font-normal leading-[1.05] text-ink";

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

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className={cn("shrink-0 text-ink-4 transition-transform duration-500 ease-soft", open && "rotate-45")}>
      <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function DatasetRow({ d, open, onToggle }: { d: Dataset; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-b border-line align-top">
        <td className="min-w-[260px] px-4 py-4">
          <button onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 text-left">
            <span className="mt-1.5"><Chevron open={open} /></span>
            <span>
              <span className="block font-display text-[21px] font-normal leading-tight text-ink">{d.name}</span>
              <span className="mt-1 block text-[12.5px] text-ink-4">{d.size}</span>
            </span>
          </button>
        </td>
        <td className="whitespace-nowrap px-4 py-4"><Bars value={d.relevance} /></td>
        <td className="whitespace-nowrap px-4 py-4"><Badge tone={STATUS_TONE[d.status]}>{d.status}</Badge></td>
        <td className="min-w-[200px] px-4 py-4 text-[12.5px] leading-snug text-ink-3">{d.licence}</td>
      </tr>
      {open && (
        <tr className="border-b border-line bg-cream/60">
          <td colSpan={4} className="px-4 py-0">
            <motion.div initial={{ opacity: 0, y: 6, filter: "blur(5px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} className="grid gap-6 py-6 pl-7 md:grid-cols-3">
              <div>
                <div className="label mb-2">What it offers</div>
                <p className="text-[13.5px] leading-relaxed text-ink-3">{d.offers}</p>
              </div>
              <div>
                <div className="label mb-2">How RTO Shield uses it</div>
                <p className="text-[13.5px] leading-relaxed text-ink-3">{d.mapping}</p>
              </div>
              <div>
                <div className="label mb-2">Limitations</div>
                <p className="text-[13.5px] leading-relaxed text-ink-3">{d.limitations}</p>
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="link-draw mt-3 inline-block text-[13px] text-brand-600">
                  Source: {d.source.split(";")[0]}
                </a>
              </div>
            </motion.div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
export function DatasetsSection() {
  const [tab, setTab] = React.useState<"global" | "india">("global");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const rows = tab === "global" ? DATASETS_GLOBAL : DATASETS_INDIA;

  return (
    <section id="datasets" className="bg-white py-28 md:py-40">
      <div className={wrap}>
        <div className="label mb-5 text-brand-500">Datasets</div>
        <h2 className={h2}>
          <BlurText text="Proxies, not labels" />
        </h2>
        <p className="mt-6 max-w-[40rem] text-[15.5px] leading-relaxed text-ink-3">
          No public dataset has an Indian COD RTO label; these are the closest public sources and how we use each.
        </p>

        <Reveal className="mt-12">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Segmented
              value={tab}
              onChange={(v) => {
                setTab(v);
                setOpenId(null);
              }}
              options={[
                { value: "global", label: `Global (${DATASETS_GLOBAL.length})` },
                { value: "india", label: `India (${DATASETS_INDIA.length})` },
              ]}
            />
            <p className="text-[12.5px] text-ink-4">Relevance is as rated in our research notes. India sources that feed the benchmark file are not rated.</p>
          </div>

          <div className="mt-6 border-t border-line">
            <Table>
              <thead>
                <tr>
                  <Th>Dataset</Th>
                  <Th>Relevance</Th>
                  <Th>Status</Th>
                  <Th>Licence</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <DatasetRow key={d.id} d={d} open={openId === d.id} onToggle={() => setOpenId(openId === d.id ? null : d.id)} />
                ))}
              </tbody>
            </Table>
          </div>
        </Reveal>

        <Reveal className="mt-24">
          <div className="label mb-3">Published RTO figures</div>
          <p className="max-w-[40rem] text-[14.5px] leading-relaxed text-ink-3">
            There is no official national RTO rate. Definitions differ between RTO, failed delivery and return, so these vendor and filing figures are directional. They set our priors; they are not measured on your orders.
          </p>
          <div className="mt-6 border-t border-line">
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
          <div className="mt-8">
            <Link href="/research#datasets" className="link-draw text-[14px] text-ink-2">
              Full research notes
            </Link>
            <span aria-hidden className="ml-1 text-ink-3">&rarr;</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
export function ResearchSection() {
  const [openN, setOpenN] = React.useState<string | null>(null);
  return (
    <section id="research" className="border-t border-line bg-cream py-28 md:py-40">
      <div className={wrap}>
        <div className="label mb-5 text-brand-500">Research</div>
        <h2 className={h2}>
          <BlurText text="Twelve papers behind the design" />
        </h2>
        <p className="mt-6 max-w-[40rem] text-[15.5px] leading-relaxed text-ink-3">
          Every paper is open access. Each one maps to a module: features, trainer, calibration, policy, impact, drift or fairness.
        </p>

        <Reveal className="mt-12">
          <ol className="border-t border-line">
            {PAPERS.map((p) => {
              const open = openN === p.number;
              return (
                <li key={p.number} className="border-b border-line">
                  <button onClick={() => setOpenN(open ? null : p.number)} aria-expanded={open} className="grid w-full grid-cols-[2.5rem_1fr_auto] items-start gap-x-4 gap-y-2 py-5 text-left md:grid-cols-[3.5rem_1fr_auto_auto]">
                    <span className="num pt-1.5 text-[13px] text-ink-4">{p.number}</span>
                    <span>
                      <span className="block font-display text-[22px] font-normal leading-tight text-ink md:text-[26px]">{p.title}</span>
                      <span className="mt-1.5 block text-[13px] text-ink-3">
                        {p.authors} · {p.year} · {p.venue}
                      </span>
                    </span>
                    <span className="hidden pt-1 md:block">
                      <Badge tone="neutral">{p.topic}</Badge>
                    </span>
                    <span className="pt-2"><Chevron open={open} /></span>
                  </button>
                  {open && (
                    <motion.div initial={{ opacity: 0, y: 6, filter: "blur(5px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} className="grid gap-8 pb-8 pl-[3.25rem] md:grid-cols-2 md:pl-[4.5rem]">
                      <div>
                        <div className="label mb-2">Key findings</div>
                        <ul className="space-y-2 text-[13.5px] leading-relaxed text-ink-3">
                          {p.findings.map((f) => (
                            <li key={f} className="flex gap-3">
                              <span aria-hidden className="mt-[9px] h-px w-3 shrink-0 bg-ink-4" />
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="label mb-2">Applied in RTO Shield</div>
                        <p className="text-[13.5px] leading-relaxed text-ink-3">{p.applied}</p>
                        <p className="mt-3 text-[12.5px] text-ink-4">Module: {p.module}</p>
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="link-draw mt-4 inline-block text-[13px] text-brand-600">
                          Read the paper
                        </a>
                      </div>
                    </motion.div>
                  )}
                </li>
              );
            })}
          </ol>
        </Reveal>

        <Reveal className="mt-14 flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-[36rem]">
            <div className="label mb-2">Gaps</div>
            <p className="text-[14px] leading-relaxed text-ink-3">
              We found no open academic paper on Indian COD RTO prediction, only vendor blog posts (Delhivery, Razorpay, Cashfree), which are not included. Paper 01 (Myntra) is the closest Indian study and covers returns, not RTO.
            </p>
          </div>
          <div>
            <Link href="/research" className="link-draw text-[14px] text-ink-2">
              Full research notes
            </Link>
            <span aria-hidden className="ml-1 text-ink-3">&rarr;</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
