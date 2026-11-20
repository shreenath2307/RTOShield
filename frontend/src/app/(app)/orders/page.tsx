"use client";
import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ListOrdered, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Order, Tier } from "@/lib/types";
import { Button, Card, Empty, ErrorNote, PageHeader, RiskBadge, Segmented, Skeleton, Table, Td, Th } from "@/components/ui";
import { ACTION_LABEL, cn, fmtDateTime, inr, num } from "@/lib/utils";
import { maskName, PaymentBadge, STATUS_META, StatusChip } from "@/components/app/order-status";
import { CommandPalette } from "@/components/app/command-palette";

type Scope = "live" | "historical" | "all";
const PAGE_SIZE = 25;

export default function OrdersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <OrdersInner />
    </Suspense>
  );
}

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = React.useState(v);
  React.useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

function OrdersInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  const [tier, setTier] = React.useState<Tier | "">((sp.get("tier") as Tier) ?? "");
  const [status, setStatus] = React.useState(sp.get("status") ?? "");
  const [payment, setPayment] = React.useState(sp.get("payment_method") ?? "");
  const [scope, setScope] = React.useState<Scope>((sp.get("scope") as Scope) ?? "live");
  const [sort, setSort] = React.useState(sp.get("sort") ?? "-created");
  const [page, setPage] = React.useState(Number(sp.get("page") ?? 1) || 1);
  const dq = useDebounced(q);

  React.useEffect(() => {
    const fromUrl = sp.get("q") ?? "";
    if (fromUrl && fromUrl !== q) setQ(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  React.useEffect(() => setPage(1), [dq, tier, status, payment, scope, sort]);

  const params = {
    q: dq || undefined,
    tier: tier || undefined,
    status: status || undefined,
    payment_method: payment || undefined,
    historical: scope === "all" ? undefined : scope === "historical",
    page,
    page_size: PAGE_SIZE,
    sort,
  };
  const query = useQuery({ queryKey: ["orders", params], queryFn: () => api.orders(params), placeholderData: keepPreviousData, refetchInterval: scope === "live" ? 15_000 : false });
  const data = query.data;
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = !!(q || tier || status || payment);

  const toggleSort = (key: string) => setSort((s) => (s === `-${key}` ? key : `-${key}`));

  return (
    <div>
      <PageHeader eyebrow="Operate" title="Orders" description="Each order with its risk score, recommended action and status." actions={<CommandPalette />} />

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order id, customer, pincode, city…" className="input pl-9" />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-4 hover:bg-canvas-3">
                <X size={14} />
              </button>
            )}
          </div>
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: "live", label: "Live" },
              { value: "historical", label: "Historical" },
              { value: "all", label: "All" },
            ]}
          />
          <select value={tier} onChange={(e) => setTier(e.target.value as Tier | "")} className="input w-auto min-w-[120px]">
            <option value="">All tiers</option>
            <option value="high">High risk</option>
            <option value="medium">Medium risk</option>
            <option value="low">Low risk</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input w-auto min-w-[140px]">
            <option value="">Any status</option>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select value={payment} onChange={(e) => setPayment(e.target.value)} className="input w-auto min-w-[120px]">
            <option value="">COD & prepaid</option>
            <option value="COD">COD</option>
            <option value="PREPAID">Prepaid</option>
          </select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQ("");
                setTier("");
                setStatus("");
                setPayment("");
                router.replace("/orders");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        {query.error ? (
          <div className="p-5">
            <ErrorNote error={query.error} />
          </div>
        ) : query.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !data?.items?.length ? (
          <Empty icon={<ListOrdered size={18} />} title="No orders match" hint={hasFilters ? "Try clearing filters." : "Import data or start the simulator on the Live page."} />
        ) : (
          <Table className={cn("transition-opacity", query.isFetching && query.isPlaceholderData && "opacity-60")}>
            <thead>
              <tr>
                <SortTh label="Order" k="order_id" sort={sort} onSort={toggleSort} />
                <SortTh label="Date" k="created" sort={sort} onSort={toggleSort} />
                <Th>Customer</Th>
                <Th>Location</Th>
                <SortTh label="Value" k="value" sort={sort} onSort={toggleSort} right />
                <Th>Payment</Th>
                <Th>Category</Th>
                <SortTh label="Risk" k="risk" sort={sort} onSort={toggleSort} />
                <Th>Action</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {data.items.map((o: Order, i) => (
                  <motion.tr
                    key={o.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 12) * 0.015 }}
                    onClick={() => router.push(`/orders/${o.id}`)}
                    className="cursor-pointer transition hover:bg-canvas-2"
                  >
                    <Td className="font-medium text-ink">{o.order_id}</Td>
                    <Td className="text-ink-3">{fmtDateTime(o.order_date)}</Td>
                    <Td>
                      <div className="text-ink-2">{maskName(o.customer_name)}</div>
                      <div className="text-[11.5px] text-ink-4">{o.customer_phone ?? o.customer_id}</div>
                    </Td>
                    <Td>
                      <div className="text-ink-2">{o.city ?? "—"}</div>
                      <div className="num text-[11.5px] text-ink-4">{o.pincode}</div>
                    </Td>
                    <Td className="num text-right font-medium text-ink">{inr(o.order_value)}</Td>
                    <Td>
                      <PaymentBadge method={o.payment_method} />
                    </Td>
                    <Td className="capitalize">{o.product_category}</Td>
                    <Td>{o.prediction ? <RiskBadge tier={o.prediction.tier} probability={o.prediction.probability} /> : <span className="text-ink-5">—</span>}</Td>
                    <Td className="text-ink-3">{o.recommendation ? ACTION_LABEL[o.recommendation.action] ?? o.recommendation.action : "—"}</Td>
                    <Td>
                      <StatusChip status={o.outcome ?? o.status} />
                    </Td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </Table>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-ink-3">
          <span>
            {total ? (
              <>
                Showing <b className="num font-medium text-ink">{num((page - 1) * PAGE_SIZE + 1)}</b>–<b className="num font-medium text-ink">{num(Math.min(page * PAGE_SIZE, total))}</b> of{" "}
                <b className="num font-medium text-ink">{num(total)}</b>
              </>
            ) : (
              "—"
            )}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={14} /> Prev
            </Button>
            <span className="num">
              {page} / {pages}
            </span>
            <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function SortTh({ label, k, sort, onSort, right }: { label: string; k: string; sort: string; onSort: (k: string) => void; right?: boolean }) {
  const active = sort === k || sort === `-${k}`;
  const desc = sort === `-${k}`;
  return (
    <Th className={right ? "text-right" : undefined}>
      <button onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 uppercase tracking-[0.06em] hover:text-ink-2", active && "text-ink-2")}>
        {label}
        {active && (desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
      </button>
    </Th>
  );
}
