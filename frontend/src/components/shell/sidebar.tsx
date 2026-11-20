"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  ListOrdered,
  Radio,
  Gauge,
  Inbox,
  Map,
  TrendingDown,
  BrainCircuit,
  Scale,
  Settings,
  Upload,
  
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const NAV = [
  { group: "Operate", items: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/live", label: "Live feed", icon: Radio },
    { href: "/orders", label: "Orders", icon: ListOrdered },
    { href: "/queue", label: "Review queue", icon: Inbox },
    { href: "/score", label: "Score an order", icon: Gauge },
  ]},
  { group: "Insights", items: [
    { href: "/heatmap", label: "Pincode heatmap", icon: Map },
    { href: "/impact", label: "Impact report", icon: TrendingDown },
    { href: "/model", label: "Model & drift", icon: BrainCircuit },
    { href: "/fairness", label: "Fairness audit", icon: Scale },
  ]},
  { group: "Setup", items: [
    { href: "/onboarding", label: "Connect data", icon: Upload },
    { href: "/settings", label: "Settings", icon: Settings },
  ]},
];

/** Logo: on hover each letter slides out right while its copy slides in from the left (eugeniagrab header logo). */
export function SlideWord({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline font-display text-[22px] font-medium uppercase leading-none tracking-[.02em] text-ink", className)}>
      {text.split("").map((ch, i) =>
        ch === " " ? (
          <span key={i} className="block w-[.28em]" />
        ) : (
          <span key={i} className="relative inline-block overflow-hidden">
            <span className="block transition-[transform,opacity] duration-[1.4s] ease-soft group-hover:translate-x-[115%] group-hover:opacity-0" style={{ transitionDelay: `${i * 25}ms` }}>
              {ch}
            </span>
            <span aria-hidden className="absolute inset-0 block -translate-x-[115%] opacity-0 transition-[transform,opacity] duration-[1.4s] ease-soft group-hover:translate-x-0 group-hover:opacity-100" style={{ transitionDelay: `${i * 25}ms` }}>
              {ch}
            </span>
          </span>
        )
      )}
    </span>
  );
}

export function Sidebar() {
  const path = usePathname();
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 10_000 });
  const { data: queue } = useQuery({ queryKey: ["queue-count"], queryFn: () => api.queue(), refetchInterval: 15_000 });
  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-cream px-3 py-6 lg:flex">
      <Link href="/" className="group mb-8 px-2" aria-label="RTO Shield home">
        <SlideWord text="RTO SHIELD" />
      </Link>
      <nav className="flex-1 space-y-5 overflow-y-auto" data-lenis-prevent>
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="label mb-1.5 px-2">{g.group}</div>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = path === it.href || path.startsWith(it.href + "/");
                const Icon = it.icon;
                return (
                  <li key={it.href}>
                    <Link href={it.href} className={cn("relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition", active ? "text-ink" : "text-ink-3 hover:bg-canvas-3 hover:text-ink-2")}>
                      {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-white ring-1 ring-line" transition={{ type: "spring", bounce: 0.15, duration: 0.45 }} />}
                      <Icon size={16} className="relative" />
                      <span className="relative flex-1">{it.label}</span>
                      {it.href === "/queue" && queue?.items?.length ? (
                        <span className="relative rounded-full bg-ink px-1.5 text-[10.5px] font-medium text-white">{queue.items.length}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="mt-4 rounded-xl border border-line bg-white p-3 text-[12px]">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", health ? "bg-emerald-500" : "bg-ink-5")} />
          <span className="font-medium text-ink">{health ? "API connected" : "Connecting…"}</span>
        </div>
        <div className="mt-1 truncate text-ink-3">
          {health ? (health.cold_start ? "Cold-start mode (benchmarks)" : `Model ${health.model_version}`) : "localhost:8000"}
        </div>
        {health?.seeding && health.seeding !== "done" && <div className="mt-1 text-amber-600">Seeding demo: {health.seeding}</div>}
      </div>
    </aside>
  );
}

export function MobileNav() {
  const path = usePathname();
  return (
    <div className="scroll-thin flex gap-1 overflow-x-auto border-b border-line px-4 py-2 lg:hidden" data-lenis-prevent>
      {NAV.flatMap((g) => g.items).map((it) => (
        <Link key={it.href} href={it.href} className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px]", path.startsWith(it.href) ? "bg-ink text-white" : "text-ink-3")}>
          {it.label}
        </Link>
      ))}
    </div>
  );
}
