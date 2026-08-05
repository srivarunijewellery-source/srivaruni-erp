"use client";

import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { ROUTES } from "@/config/nav";
import type { BranchSales, RecentBill, RegisterStatus } from "./dashboard-queries";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function SalesDashboard({
  branches,
  registers,
  recent,
  from,
  to,
}: {
  branches: BranchSales[];
  registers: RegisterStatus[];
  recent: RecentBill[];
  from: string;
  to: string;
}) {
  const router = useRouter();

  function go(f: string, t: string) {
    router.push(`${ROUTES.sales}?from=${f}&to=${t}`);
  }

  function preset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    go(iso(start), iso(end));
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
        <CardBody className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => go(e.target.value, to)}
              className="w-44"
            />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => go(from, e.target.value)}
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
                  <span className="w-32 font-mono text-2xs text-text-muted">{r.billNo}</span>
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
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

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
