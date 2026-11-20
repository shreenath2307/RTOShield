"use client";
import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { BlurText, ChartTooltip, CircleButton, RiskBadge, Reveal } from "@/components/ui";
import { SlideWord } from "@/components/shell/sidebar";
import { CHART, cn, num, pct } from "@/lib/utils";
import type { Tier } from "@/lib/types";
import { ApiNote, Loading, SectionHead, useLiveOrders, useSummary, useTrend, wrap, pill } from "./shared";
import { InsideProduct, TryIt } from "./product";
import { Architecture } from "./architecture";
import { DatasetsSection, ResearchSection } from "./research";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);


/* ------------------------------------------------------------------ */
function TopBar() {
  const links = [
    ["How it works", "#how"],
    ["Try it", "#try"],
    ["Product", "#product"],
    ["Interventions", "#interventions"],
    ["Architecture", "#architecture"],
    ["Responsible AI", "#responsible"],
    ["Data", "#datasets"],
    ["Research", "#research"],
    ["FAQ", "#faq"],
  ];
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="border-b border-line bg-cream">
        <p className={cn(wrap, "py-2 text-center text-[12px] text-ink-3")}>
          COD orders in India come back at 37.5%, prepaid at 5.3%. Source: ClickPost, FY2026.
        </p>
      </div>
      <div className={cn(wrap, "flex h-[72px] items-center justify-between")}>
        <Link href="/" className="group" aria-label="RTO Shield home">
          <SlideWord text="RTO SHIELD" />
        </Link>
        <nav className="hidden items-center gap-6 text-[13.5px] xl:gap-8 xl:text-[14px] text-ink-2 lg:flex">
          {links.map(([l, h]) => (
            <a key={h} href={h} className="link-draw">
              {l}
            </a>
          ))}
        </nav>
        <Link href="/dashboard" className={cn(pill, "h-10 border-ink text-ink hover:bg-ink hover:text-white")}>
          Open dashboard
        </Link>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="p-3.5 sm:p-4">
      <div className="label">{label}</div>
      <div className="num mt-2 font-display text-[28px] leading-none text-ink">{value}</div>
      {sub && <div className="mt-1.5 text-[11.5px] text-ink-4">{sub}</div>}
    </div>
  );
}

function HeroPreview() {
  const sum = useSummary();
  const trend = useTrend();
  const orders = useLiveOrders();
  const s = sum.data;
  const pts = (trend.data ?? []).map((t) => ({ period: t.period, rate: +(t.rto_rate * 100).toFixed(1) }));
  return (
    <div>
      <div className="label mb-3">Live from the demo backend</div>
      <div data-h-list className="border border-line-2 bg-white">
        {sum.isError ? (
          <div className="p-5">
            <ApiNote what="The dashboard summary" />
          </div>
        ) : (
          <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
            <Kpi label="Orders analysed" value={s ? num(s.orders_analyzed) : <Loading rows={1} h="h-7" />} sub="all channels" />
            <Kpi label="RTO, COD / prepaid" value={s ? `${pct(s.cod_rto_rate, 0)} / ${pct(s.prepaid_rto_rate, 0)}` : <Loading rows={1} h="h-7" />} sub="historical" />
            <Kpi label="Flagged today" value={s ? num(s.flagged_today) : <Loading rows={1} h="h-7" />} sub="medium and high" />
          </div>
        )}
        <div className="border-b border-line px-4 pb-2 pt-3 sm:px-5">
          <div className="flex items-baseline justify-between">
            <span className="label">RTO rate by month</span>
            {pts.length > 0 && <span className="num text-[12px] text-ink-3">{pts[pts.length - 1].rate}% latest</span>}
          </div>
          <div className="h-[72px]">
            {trend.isError ? (
              <div className="pt-3">
                <ApiNote what="The trend" />
              </div>
            ) : pts.length < 2 ? (
              <Loading rows={1} h="h-14" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pts} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="period" hide />
                  <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} />
                  <Area type="monotone" dataKey="rate" name="RTO rate" stroke={CHART.brand} strokeWidth={1.5} fill={CHART.brandSoft} fillOpacity={0.35} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="px-4 pb-1 pt-3 sm:px-5">
          <span className="label">Highest-risk live orders</span>
        </div>
        {orders.isError ? (
          <div className="p-5">
            <ApiNote what="Live orders" />
          </div>
        ) : !orders.data ? (
          <div className="p-5">
            <Loading rows={4} h="h-9" />
          </div>
        ) : orders.data.items.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-4">No live orders have been scored yet.</p>
        ) : (
          orders.data.items.map((o) => (
            <div key={o.id} data-h-row className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0 sm:px-5">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2.5">
                  <span className="num truncate text-[13px] font-medium text-ink">{o.order_id}</span>
                  <span className="num text-[12.5px] text-ink-3">{`₹${num(Math.round(o.order_value))}`}</span>
                  <span className="text-[10.5px] uppercase tracking-[0.08em] text-ink-4">{o.payment_method}</span>
                </div>
                <div className="truncate text-[12px] text-ink-3">
                  {o.pincode}
                  {o.city ? ` · ${o.city}` : ""}
                </div>
              </div>
              {o.prediction && <RiskBadge tier={o.prediction.tier} probability={o.prediction.probability} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Hero() {
  const root = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    const mm = gsap.matchMedia();
    mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: root.current, start: "top top", end: "bottom bottom", scrub: 0.6 },
      });
      tl.fromTo("[data-h-line2]", { x: 0 }, { x: "8vw", duration: 1 }, 0)
        .fromTo("[data-h-list]", { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 0.8 }, 0.1)
        .fromTo("[data-h-row]", { opacity: 0.25 }, { opacity: 1, stagger: 0.15, duration: 0.3 }, 0.2)
        .to("[data-h-sub]", { y: -12, duration: 1 }, 0);
    });
    return () => mm.revert();
  }, []);

  return (
    <section ref={root} className="relative bg-cream lg:h-[200vh]">
      <div className="lg:sticky lg:top-0 lg:flex lg:h-screen lg:items-center lg:overflow-hidden">
        <div className={cn(wrap, "grid gap-12 pb-20 pt-40 lg:grid-cols-[1.25fr_1fr] lg:items-center lg:gap-10 lg:pb-0 lg:pt-28")}>
          <div>
            <h1 className="font-display text-[clamp(3.4rem,8.4vw,8rem)] font-normal leading-[0.98] tracking-[-0.02em] text-ink">
              <span className="block animate-blurIn">Know which orders</span>
              <span data-h-line2 className="block animate-blurIn pl-[6vw] lg:pl-[4vw]" style={{ animationDelay: "120ms" }}>
                come back.
              </span>
            </h1>
            <p data-h-sub className="mt-8 max-w-[34rem] text-[17px] leading-relaxed text-ink-3">
              RTO Shield scores each COD order for return risk before dispatch and steps in only on the risky ones.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-5">
              <CircleButton href="/dashboard" size={132}>
                Open dashboard
              </CircleButton>
              <Link href="/onboarding" className={cn(pill, "border-line-2 text-ink hover:border-ink")}>
                Connect store
              </Link>
            </div>
          </div>

          <HeroPreview />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
function Figures() {
  const f = [
    ["37.5%", "of COD orders return to origin, against 5.3% for prepaid.", "ClickPost, FY2026"],
    ["23.7%", "COD-heavy brands see this RTO rate in Tier-3 towns, against 10.9% in metros.", "ClickPost"],
    ["14–18%", "is the industry average RTO rate across Indian e-commerce shipments.", "Delhivery"],
  ];
  return (
    <section className="border-y border-line bg-white">
      <div className={cn(wrap, "grid md:grid-cols-3")}>
        {f.map(([n, l, s], i) => (
          <Reveal key={n} delay={i * 0.08} className={cn("py-12 md:px-8 md:first:pl-0", i > 0 && "border-t border-line md:border-l md:border-t-0")}>
            <div className="num font-display text-[72px] leading-none text-ink">{n}</div>
            <p className="mt-5 max-w-[20rem] text-[14.5px] leading-relaxed text-ink-3">{l}</p>
            <p className="mt-3 text-[12px] text-ink-4">Source: {s}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
const STEPS = [
  ["Ingest", "Orders arrive from your store webhook or a CSV export, with pincode, order value, payment mode and customer history."],
  ["Score", "A gradient-boosted model returns an RTO probability and a tier for each COD order, with the factors that moved it."],
  ["Act", "Low-risk orders ship untouched. Medium and high tiers get the intervention set for that tier, never a blanket rule."],
  ["Measure", "A random holdout group gets no intervention. Savings are the RTO-rate gap between that group and the rest."],
];

function HowItWorks() {
  return (
    <section className="bg-white py-28 md:py-40">
      <div className={wrap}>
        <SectionHead id="how" label="How it works" title="Four steps, one decision per order" />
        <ol className="mt-20 border-t border-line">
          {STEPS.map(([h, b], i) => (
            <li key={h} className="grid gap-4 border-b border-line py-9 md:grid-cols-[120px_1fr_1.3fr] md:gap-10">
              <span className="num font-display text-[28px] text-ink-4">0{i + 1}</span>
              <h3 className="font-display text-[34px] leading-none text-ink">
                <BlurText text={h} />
              </h3>
              <p className="max-w-[34rem] text-[15.5px] leading-relaxed text-ink-3">
                <BlurText text={b} />
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
const TIERS: { tier: Tier; action: string; note: string }[] = [
  { tier: "low", action: "Ship normally", note: "No message, no friction. Most orders land here." },
  { tier: "medium", action: "WhatsApp confirmation, or a prepaid offer", note: "The customer confirms address and intent, or is offered a discount to pay upfront." },
  { tier: "high", action: "Manual review", note: "An agent sees the order and the score factors, then holds, calls or ships. Nothing is cancelled automatically." },
];

function Interventions() {
  return (
    <section className="bg-cream py-28 md:py-40">
      <div className={wrap}>
        <SectionHead id="interventions" label="Interventions" title="Act on the risky few" />
        <div className="mt-20 grid border-t border-line-2 md:grid-cols-3">
          {TIERS.map((t, i) => (
            <Reveal key={t.tier} delay={i * 0.08} className={cn("py-10 md:px-8 md:first:pl-0", i > 0 && "border-t border-line-2 md:border-l md:border-t-0")}>
              <RiskBadge tier={t.tier} />
              <h3 className="mt-10 font-display text-[30px] leading-[1.1] text-ink">{t.action}</h3>
              <p className="mt-4 text-[14.5px] leading-relaxed text-ink-3">{t.note}</p>
            </Reveal>
          ))}
        </div>
        <p className="mt-12 max-w-[40rem] text-[15.5px] leading-relaxed text-ink-3">
          Asking every COD buyer to confirm adds a step for the many who would have accepted delivery anyway, and some of them drop off. Tiering keeps that cost on the minority where it pays back.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
const RAI = [
  ["Pincode contribution cap", "No single pincode can move a score past a fixed ceiling, so a postal area never decides an order by itself."],
  ["No auto-cancel", "The highest action is manual review. A person makes every hold or cancellation."],
  ["Smoothed regional rates", "Pincode RTO rates are pulled toward regional benchmarks, so thin data in a small area does not produce extreme scores."],
  ["Income band for audit only", "Income band is never a model feature. It is used afterwards to check whether tiers fall unevenly across bands."],
];

function Responsible() {
  return (
    <section className="bg-cream py-28 md:py-40">
      <div className={cn(wrap, "grid gap-16 lg:grid-cols-[1fr_1.2fr]")}>
        <div>
          <SectionHead id="responsible" label="Responsible AI" title="Limits built into the score" />
          <Link href="/fairness" className="link-draw mt-10 text-[15px] text-ink">
            Read the fairness audit
          </Link>
        </div>
        <dl className="border-t border-line">
          {RAI.map(([h, b]) => (
            <Reveal key={h} className="border-b border-line py-7">
              <dt className="font-display text-[26px] leading-tight text-ink">{h}</dt>
              <dd className="mt-2 max-w-[32rem] text-[14.5px] leading-relaxed text-ink-3">{b}</dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
function ColdStart() {
  const root = React.useRef<HTMLElement>(null);
  const bar = React.useRef<HTMLDivElement>(null);
  const nEl = React.useRef<HTMLSpanElement>(null);
  const wEl = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    const paint = (n: number) => {
      const w = 500 / (n + 500);
      if (bar.current) bar.current.style.width = `${w * 100}%`;
      if (nEl.current) nEl.current.textContent = Math.round(n).toLocaleString("en-IN");
      if (wEl.current) wEl.current.textContent = `${Math.round(w * 100)}%`;
    };
    paint(0);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      paint(1500);
      return;
    }
    const st = ScrollTrigger.create({
      trigger: root.current,
      start: "top 70%",
      end: "bottom 40%",
      scrub: 0.5,
      onUpdate: (self) => paint(self.progress * 3000),
    });
    return () => st.kill();
  }, []);

  return (
    <section ref={root} className="bg-white py-28 md:py-40">
      <div className={cn(wrap, "grid gap-16 lg:grid-cols-2")}>
        <div>
          <SectionHead label="Cold start" title="Useful before you have history" />
          <p className="mt-8 max-w-[30rem] text-[15.5px] leading-relaxed text-ink-3">
            A new store has no labelled outcomes, so early scores lean on published regional benchmarks. Each delivered or returned order moves weight to your own data by n / (n + 500), where n is your labelled order count. At 500 orders the split is even.
          </p>
        </div>
        <div className="self-end">
          <div className="flex items-baseline justify-between text-[13px] text-ink-3">
            <span>
              Labelled orders <span ref={nEl} className="num text-ink">0</span>
            </span>
            <span>
              Benchmark weight <span ref={wEl} className="num text-ink">100%</span>
            </span>
          </div>
          <div className="mt-4 h-px w-full bg-line-2">
            <div ref={bar} className="-mt-px h-[3px] bg-ink" style={{ width: "100%" }} />
          </div>
          <div className="mt-3 flex justify-between text-[11.5px] text-ink-4">
            <span>Benchmarks only</span>
            <span>Your orders</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
const FAQS = [
  ["What data do I need?", "Order id, order date, pincode, order value and payment mode are enough to start. Delivery outcome (delivered or RTO) per order lets the model learn from your history. Customer phone enables WhatsApp confirmation."],
  ["Which CSV formats work?", "Exports from Shopify, WooCommerce and Shiprocket are mapped on upload. Other files work if you match the columns on the onboarding screen."],
  ["What if I have no order history?", "Scores come from regional benchmarks until you have labelled orders, then shift toward your own data as your count grows. See the cold start section above."],
  ["Is the WhatsApp step real or a mock?", "In this build it is a mock. Messages and customer replies are simulated so the flow can be tested end to end. Sending real messages needs a WhatsApp Business API account, which is not connected."],
  ["How are savings measured?", "A random share of risky orders is held out and receives no intervention. Savings are the difference in RTO rate between held-out and treated orders, applied to order value and shipping cost. Figures are estimates until validated in a pilot."],
  ["Does it reject customers?", "No. The system never cancels an order. The strongest action is a manual review queue, and a person decides what happens next."],
];

function FAQ() {
  const [open, setOpen] = React.useState<number | null>(0);
  return (
    <section className="bg-white py-28 md:py-40">
      <div className={cn(wrap, "grid gap-16 lg:grid-cols-[1fr_1.5fr]")}>
        <SectionHead id="faq" label="FAQ" title="Questions before you connect" />
        <div className="border-t border-line">
          {FAQS.map(([q, a], i) => {
            const isOpen = open === i;
            return (
              <div key={q} className="border-b border-line">
                <button onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen} className="flex w-full items-center justify-between gap-6 py-6 text-left">
                  <span className="font-display text-[24px] leading-tight text-ink">{q}</span>
                  <span aria-hidden className="relative h-3.5 w-3.5 shrink-0">
                    <span className="absolute left-0 top-1/2 h-px w-full bg-ink" />
                    <span className={cn("absolute left-1/2 top-0 h-full w-px bg-ink transition-transform duration-500 ease-soft", isOpen && "scale-y-0")} />
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="max-w-[36rem] pb-7 text-[15px] leading-relaxed text-ink-3">{a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
function Closing() {
  return (
    <section className="bg-ink py-28 text-cream md:py-40">
      <div className={cn(wrap, "flex flex-col items-start justify-between gap-12 md:flex-row md:items-end")}>
        <h2 className="max-w-[14ch] font-display text-[clamp(2.8rem,6.5vw,6rem)] font-normal leading-[1.02] text-cream">
          <BlurText text="Check orders before they ship." />
        </h2>
        <CircleButton href="/dashboard" size={150}>
          Open dashboard
        </CircleButton>
      </div>
    </section>
  );
}

function Footer() {
  const cols: [string, [string, string][]][] = [
    ["Product", [["Dashboard", "/dashboard"], ["Score an order", "/score"], ["Impact report", "/impact"], ["Connect store", "/onboarding"]]],
    ["Trust", [["Fairness audit", "/fairness"], ["Model and drift", "/model"], ["Settings", "/settings"]]],
  ];
  return (
    <footer className="border-t border-line bg-white py-16">
      <div className={cn(wrap, "grid gap-12 md:grid-cols-[1.5fr_1fr_1fr]")}>
        <div>
          <Link href="/" className="group" aria-label="RTO Shield home">
            <SlideWord text="RTO SHIELD" />
          </Link>
          <p className="mt-4 max-w-[22rem] text-[14px] leading-relaxed text-ink-3">Return-to-origin risk scoring for Indian D2C brands that ship cash on delivery.</p>
        </div>
        {cols.map(([h, ls]) => (
          <div key={h}>
            <div className="label mb-4">{h}</div>
            <ul className="space-y-2.5 text-[14px] text-ink-2">
              {ls.map(([l, href]) => (
                <li key={href}>
                  <Link href={href} className="link-draw">
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className={cn(wrap, "mt-14 border-t border-line pt-6 text-[12px] text-ink-4")}>Savings figures are estimates until validated in a pilot.</div>
    </footer>
  );
}

export function Landing() {
  return (
    <div className="bg-white">
      <TopBar />
      <main>
        <Hero />
        <Figures />
        <HowItWorks />
        <TryIt />
        <InsideProduct />
        <Interventions />
        <ColdStart />
        <Responsible />
        <Architecture />
        <DatasetsSection />
        <ResearchSection />
        <FAQ />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}
