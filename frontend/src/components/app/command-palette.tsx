"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Command as CmdIcon, Search, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { NAV } from "@/components/shell/sidebar";
import { RiskBadge } from "@/components/ui";
import { cn, inr } from "@/lib/utils";

function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = React.useState(v);
  React.useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

/** ⌘K / Ctrl+K palette: jump to pages or search orders by id / customer / pincode. */
export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const dq = useDebounced(q.trim());
  const router = useRouter();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["cmdk-orders", dq],
    queryFn: () => api.orders({ q: dq, page_size: 8, sort: "-created" }),
    enabled: open && dq.length >= 2,
  });

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  const pages = NAV.flatMap((g) => g.items);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-line-2 bg-white px-3 text-[13px] text-ink-4 transition hover:bg-canvas-2"
      >
        <Search size={14} />
        <span className="hidden sm:inline">Search orders…</span>
        <kbd className="ml-2 hidden items-center gap-0.5 rounded-md border border-line bg-canvas-2 px-1.5 py-0.5 text-[11px] text-ink-3 sm:inline-flex">
          <CmdIcon size={10} />K
        </kbd>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 px-4 pt-[12vh] backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-white"
              onClick={(e) => e.stopPropagation()}
            >
              <Command shouldFilter={false} label="Command palette">
                <div className="flex items-center gap-2 border-b border-line px-4">
                  <Search size={15} className="text-ink-4" />
                  <Command.Input
                    autoFocus
                    value={q}
                    onValueChange={setQ}
                    placeholder="Order id, customer, pincode or page…"
                    className="h-12 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-5"
                  />
                  {isFetching && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-5 border-t-transparent" />}
                </div>
                <Command.List className="scroll-thin max-h-[360px] overflow-y-auto p-2" data-lenis-prevent>
                  <Command.Empty className="px-3 py-6 text-center text-[13px] text-ink-4">No results.</Command.Empty>
                  {dq.length >= 2 && (data?.items?.length ?? 0) > 0 && (
                    <Command.Group heading="Orders" className={groupCls}>
                      {data!.items.map((o) => (
                        <Command.Item key={o.id} value={`order-${o.id}`} onSelect={() => go(`/orders/${o.id}`)} className={itemCls}>
                          <span className="flex-1 truncate">
                            <span className="font-medium text-ink">{o.order_id}</span>
                            <span className="ml-2 text-ink-4">
                              {o.city ?? o.pincode} · {inr(o.order_value)}
                            </span>
                          </span>
                          {o.prediction && <RiskBadge tier={o.prediction.tier} probability={o.prediction.probability} />}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                  {dq.length >= 2 && (
                    <Command.Group heading="Search" className={groupCls}>
                      <Command.Item value="search-all" onSelect={() => go(`/orders?q=${encodeURIComponent(dq)}`)} className={itemCls}>
                        <Search size={14} className="text-ink-4" />
                        <span className="flex-1">
                          Search all orders for “<span className="font-medium text-ink">{dq}</span>”
                        </span>
                      </Command.Item>
                    </Command.Group>
                  )}
                  <Command.Group heading="Pages" className={groupCls}>
                    {pages
                      .filter((p) => !q || p.label.toLowerCase().includes(q.toLowerCase()))
                      .map((p) => {
                        const Icon = p.icon;
                        return (
                          <Command.Item key={p.href} value={`page-${p.href}`} onSelect={() => go(p.href)} className={itemCls}>
                            <Icon size={14} className="text-ink-4" />
                            <span className="flex-1">{p.label}</span>
                            <ArrowRight size={13} className="text-ink-5" />
                          </Command.Item>
                        );
                      })}
                  </Command.Group>
                </Command.List>
              </Command>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

const groupCls = cn(
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-ink-4"
);
const itemCls = "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-ink-2 data-[selected=true]:bg-canvas-3 data-[selected=true]:text-ink";
