"use client";

import Link from "next/link";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { ROUTES } from "@/config/nav";
import { BillSellerEditor } from "./BillSellerEditor";
import type { Seller } from "./queries";
import type {
  BranchSales,
  RecentBill,
  RegisterStatus,
  SalespersonRow,
} from "./dashboard-queries";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function SalesDashboard({
  branches,
  registers,
  recent,
  sellers,
  staffList,
  from,
  to,
  filters,
}: {
  branches: BranchSales[];
  registers: RegisterStatus[];
  recent: RecentBill[];
  sellers: SalespersonRow[];
  staffList: Seller[];
  from: string;
  to: string;
  /** Everything narrowing the bill list, kept in the URL. */
  filters: { location: string; soldBy: string; status: string; q: string };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string; no: string } | null>(null);
  const [q, setQ] = useState(filters.q);

  /**
   * Every control writes the WHOLE query string.
   *
   * The date pickers used to push `?from=&to=` and nothing else, so
   * choosing a branch and then changing the date silently threw the
   * branch away. Merging into the existing params means the filters
   * compose instead of fighting.
   */
  function go(next: Partial<Record<string, string>>) {
    const merged: Record<string, string> = {
      from,
      to,
      location: filters.location,
      soldBy: filters.soldBy,
      status: filters.status,
      q: filters.q,
      ...next,
    };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    router.push(`${ROUTES.sales}?${params.toString()}`);
  }

  function preset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    go({ from: iso(start), to: iso(end) });
  }

  const active = branches.filter((b) => b.bills > 0);
  const totals = active.reduce(
    (acc, b) => ({
      bills: acc.bills + b.bills,
      items: acc.items + b.items,
      net: acc.net + b.netPaise,
      disc: acc.disc + b.discountPaise,
      tax: acc.tax + b.taxPaise,
      cash: acc.cash + b.cashPaise,
      upi: acc.upi + b.upiPaise,
      card: acc.card + b.cardPaise,
      other: acc.other + b.otherPaise,
    }),
    { bills: 0, items: 0, net: 0, disc: 0, tax: 0, cash: 0, upi: 0, card: 0, other: 0 },
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="from">From</Label>
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(e) => go({ from: e.target.value })}
                className="w-44"
              />
            </div>
            <div>
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(e) => go({ to: e.target.value })}
                className="w-44"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => preset(0)}>
                Today
              </Button>
              <Button size="sm" variant="secondary" onClick={() => preset(7)}>
                7 days
              </Button>
              <Button size="sm" variant="secondary" onClick={() => preset(30)}>
                30 days
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="branch">Branch</Label>
              <Select
                id="branch"
                value={filters.location}
                onChange={(e) => go({ location: e.target.value })}
              >
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.locationId} value={b.locationId}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="soldBy">Salesperson</Label>
              <Select
                id="soldBy"
                value={filters.soldBy}
                onChange={(e) => go({ soldBy: e.target.value })}
              >
                <option value="">Everyone</option>
                {staffList.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                id="status"
                value={filters.status}
                onChange={(e) => go({ status: e.target.value })}
              >
                <option value="">Final and cancelled</option>
                <option value="final">Final only</option>
                <option value="cancelled">Cancelled only</option>
              </Select>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                go({ q: q.trim() });
              }}
            >
              <Label htmlFor="billq">Find a bill</Label>
              <div className="flex gap-2">
                <Input
                  id="billq"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Bill number or customer"
                />
                <Button type="submit" variant="secondary">
                  Go
                </Button>
              </div>
            </form>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Revenue" value={formatPaise(totals.net)} big />
        <Stat label="Bills" value={String(totals.bills)} />
        <Stat label="Pieces sold" value={String(totals.items)} />
        <Stat label="Discounts given" value={formatPaise(totals.disc)} />
      </div>

      <Card>
        <CardHeader className="font-medium">How it was paid</CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-4">
          <Stat label="Cash" value={formatPaise(totals.cash)} />
          <Stat label="UPI" value={formatPaise(totals.upi)} />
          <Stat label="Card" value={formatPaise(totals.card)} />
          <Stat label="Other" value={formatPaise(totals.other)} />
        </CardBody>
      </Card>

      {/* --------------------------------------------------- registers */}
      <Card>
        <CardHeader className="flex items-center justify-between gap-2">
          <span className="font-medium">Open counters</span>
          <span className="text-2xs text-text-muted">
            {registers.length === 0 ? "none open" : `${registers.length} open now`}
          </span>
        </CardHeader>
        <CardBody className="p-0">
          {registers.length === 0 ? (
            <p className="px-4 py-6 text-sm text-text-muted">
              No counter is open. Sales can still be rung up, but they will not be
              attached to a day and no drawer can be reconciled.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {registers.map((r) => (
                <li key={r.sessionId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-medium">
                      {r.locationCode} · {r.terminal}
                    </p>
                    <p className="text-2xs text-text-muted">
                      {r.openedBy ?? "—"} · since{" "}
                      {new Date(r.openedAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {r.bills} bill{r.bills === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xs text-text-muted">Sales</p>
                    <p className="font-mono text-sm">{formatPaise(r.salesPaise)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xs text-text-muted">Cash should be</p>
                    <p className="font-mono text-sm">{formatPaise(r.expectedCashPaise)}</p>
                    <p className="text-2xs text-text-subtle">
                      float {formatPaise(r.floatPaise)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ---------------------------------------------------- branches */}
      <Card>
        <CardHeader className="font-medium">By branch</CardHeader>
        <CardBody className="p-0">
          {active.length === 0 ? (
            <p className="px-4 py-6 text-sm text-text-muted">
              Nothing sold in this period.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {active.map((b) => (
                <li key={b.locationId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-36 flex-1">
                    <p className="text-sm font-medium">
                      {b.code} <span className="text-text-muted">{b.name}</span>
                    </p>
                    <p className="text-2xs text-text-muted">
                      {b.bills} bills · {b.items} pieces · cash {formatPaise(b.cashPaise)} ·
                      UPI {formatPaise(b.upiPaise)} · card {formatPaise(b.cardPaise)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm">{formatPaise(b.netPaise)}</p>
                    <p className="text-2xs text-text-muted">
                      incl {formatPaise(b.taxPaise)} GST
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ------------------------------------------------- salespeople */}
      <Card>
        <CardHeader className="flex items-center justify-between gap-2">
          <span className="font-medium">Who sold what</span>
          <span className="text-2xs text-text-muted">credited per line</span>
        </CardHeader>
        <CardBody className="p-0">
          {sellers.length === 0 ? (
            <p className="px-4 py-6 text-sm text-text-muted">No sales in this period.</p>
          ) : (
            <ul className="divide-y divide-border">
              {sellers.map((s) => (
                <li key={s.staffId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-36 flex-1">
                    <p className="text-sm font-medium">{s.staffName}</p>
                    <p className="text-2xs text-text-muted">
                      {s.pieces} pieces across {s.billsTouched} bill
                      {s.billsTouched === 1 ? "" : "s"}
                      {s.locationCode ? ` · ${s.locationCode}` : ""}
                    </p>
                  </div>
                  <span className="font-mono text-sm">{formatPaise(s.soldPaise)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-border px-4 py-2.5 text-2xs text-text-muted">
            A bill split between two people counts for both, so these add up to the
            revenue above rather than double-counting it.
          </p>
        </CardBody>
      </Card>

      {/* ------------------------------------------------------- bills */}
      <Card>
        <CardHeader className="font-medium">Recent bills</CardHeader>
        <CardBody className="p-0">
          {recent.length === 0 ? (
            <EmptyState title="No bills yet" />
          ) : (
            <ul className="max-h-[28rem] divide-y divide-border overflow-auto">
              {recent.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  {/* The bill number is the way in to the whole bill --
                      lines, payments, gifts and any returns against it.
                      It was plain text everywhere until now. */}
                  <Link
                    href={ROUTES.billDetail(r.id)}
                    className="w-32 font-mono text-2xs text-text-muted hover:text-brand hover:underline"
                  >
                    {r.billNo}
                  </Link>
                  <div className="min-w-32 flex-1">
                    <p className="truncate text-sm">
                      {r.customerName ?? "Walk-in"}
                      {r.status === "cancelled" && (
                        <Badge tone="danger" className="ml-2">
                          cancelled
                        </Badge>
                      )}
                    </p>
                    <p className="text-2xs text-text-muted">
                      {[formatDate(r.billDate), r.locationCode, r.soldByName, r.paymentMode]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span
                    className={`font-mono text-sm ${
                      r.status === "cancelled" ? "text-text-subtle line-through" : ""
                    }`}
                  >
                    {formatPaise(r.totalPaise)}
                  </span>
                  {r.status === "final" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing({ id: r.id, no: r.billNo })}
                    >
                      Salesman
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {editing && (
        <BillSellerEditor
          billId={editing.id}
          billNo={editing.no}
          sellers={staffList}
          onClose={() => setEditing(null)}
        />
      )}

      <p className="px-1 text-2xs text-text-muted">
        These are revenue figures, not profit. Cost of goods is not posted yet — it needs
        the landed cost of the exact lots sold, which billing does not resolve until the
        stock module is wired into it. A margin built on an average would look
        authoritative and be wrong, so none is shown.
      </p>
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="rounded-card border border-border bg-surface p-3">
      <p className="text-2xs text-text-muted">{label}</p>
      <p className={`mt-0.5 font-mono ${big ? "text-2xl" : "text-lg"}`}>{value}</p>
    </div>
  );
}
