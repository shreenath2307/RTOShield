"use client";
import * as React from "react";
import { Reveal } from "@/components/ui";
import { cn } from "@/lib/utils";
import { SectionHead, wrap } from "./shared";

const PIPE: [string, string, string][] = [
  ["Sources", "Store, CSV, webhooks", "Shopify and WooCommerce sync, CSV upload, order webhooks."],
  ["Ingest and validate", "Column mapping, quality report", "Rows that fail validation are dropped and listed, not guessed."],
  ["Feature engine", "Leakage-safe", "History features use only orders placed before the one being scored."],
  ["Model", "LightGBM, calibrated", "Blended with a cold-start benchmark by n / (n + 500)."],
  ["Policy", "Cost-based, with holdout", "Picks the action with the best expected net value. A random share gets none."],
  ["Action", "WhatsApp, SMS, review", "Customer reply or an agent decision moves the order on."],
];

const LOOP: [string, string][] = [
  ["Outcomes", "Delivered or RTO, recorded per order."],
  ["Impact monitor", "Treatment against holdout, with a p-value."],
  ["Drift monitor", "PSI per feature and RTO rate shift."],
  ["Fairness monitor", "Flag and error rates across groups."],
  ["Retrain", "Triggered by schedule or drift."],
];

const STACK = ["FastAPI", "SQLAlchemy", "LightGBM", "scikit-learn", "pandas", "Next.js", "GSAP", "Lenis", "Framer Motion", "Recharts", "Leaflet"];

function Arrow({ vertical }: { vertical?: boolean }) {
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center text-ink-4", vertical ? "h-6 w-full" : "hidden w-6 xl:flex")}>
      <svg width={vertical ? 12 : 20} height={vertical ? 16 : 12} viewBox="0 0 20 12" className={vertical ? "rotate-90" : ""} fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M0 6h18M13 1l5 5-5 5" />
      </svg>
    </span>
  );
}

export function Architecture() {
  return (
    <section className="bg-cream py-28 md:py-40">
      <div className={wrap}>
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <SectionHead id="architecture" label="Architecture" title="From order to outcome and back" />
          <p className="max-w-[26rem] text-[15px] leading-relaxed text-ink-3">
            Every scored order is later compared with what happened to it. Those outcomes feed the monitors, and the monitors decide when the model is retrained.
          </p>
        </div>

        <Reveal className="mt-16">
          <div className="label mb-4">Request path</div>
          <ol className="grid gap-px border border-line-2 bg-line-2 sm:grid-cols-2 xl:flex xl:gap-0 xl:border-0 xl:bg-transparent">
            {PIPE.map(([h, s, b], i) => (
              <React.Fragment key={h}>
                <li className="bg-white p-5 xl:flex-1 xl:border xl:border-line-2">
                  <span className="num text-[12px] text-ink-4">0{i + 1}</span>
                  <h3 className="mt-3 font-display text-[24px] leading-tight text-ink">{h}</h3>
                  <div className="mt-1 text-[12.5px] text-ink-2">{s}</div>
                  <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">{b}</p>
                </li>
                {i < PIPE.length - 1 && <Arrow />}
              </React.Fragment>
            ))}
          </ol>
        </Reveal>

        <div className="mt-10 flex justify-center text-ink-4">
          <svg width="20" height="28" viewBox="0 0 20 28" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
            <path d="M10 0v26M5 21l5 5 5-5" />
          </svg>
        </div>

        <Reveal className="mt-4">
          <div className="label mb-4">Feedback loop</div>
          <ol className="grid gap-px border border-line-2 bg-line-2 sm:grid-cols-2 lg:grid-cols-5">
            {LOOP.map(([h, b], i) => (
              <li key={h} className={cn("bg-white p-5", i === 0 && "bg-canvas-2")}>
                <h3 className="font-display text-[22px] leading-tight text-ink">{h}</h3>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">{b}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 flex items-center gap-2 text-[12.5px] text-ink-3">
            <svg width="22" height="12" viewBox="0 0 22 12" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden className="text-ink-4">
              <path d="M22 6H3M8 1L3 6l5 5" />
            </svg>
            A retrained model goes back to the feature engine and model step above.
          </p>
        </Reveal>

        <div className="mt-16 border-t border-line-2 pt-8">
          <div className="label mb-4">Stack</div>
          <ul className="flex flex-wrap gap-2">
            {STACK.map((s) => (
              <li key={s} className="rounded-full border border-line-2 bg-white px-4 py-1.5 text-[13px] text-ink-2">
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
