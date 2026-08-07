"use client";


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
import { BillPeek } from "@/features/sales/BillPeek";
import { CustomerPeek } from "@/features/customers/CustomerPeek";
import { BillsBehind, type DrillSpec } from "./BillsBehind";
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
  // Peeking at a bill should not cost you your place in the list.
  const [peek, setPeek] = useState<{ id: string; no: string } | null>(null);
  // Same rule as bills: a name with data behind it opens that data.
  const [peekCustomer, setPeekCustomer] = useState<{ id: string; name: string } | null>(
    null,
  );
  // Every figure on this page is a sum of documents; this is how you get
  // to them.
  const [drill, setDrill] = useState<DrillSpec | null>(null);
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
        <Stat
          label="Revenue"
          value={formatPaise(totals.net)}
          big
          onClick={() => setDrill({ title: "Every bill", from, to, locationId: filters.location || null })}
        />
        <Stat
          label="Bills"
          value={String(totals.bills)}
          onClick={() => setDrill({ title: "Every bill", from, to, locationId: filters.location || null })}
        />
        {/* Pieces has no bill-level drill that would mean anything --
            a piece count is not a list of bills -- so it stays plain
            rather than opening something that answers a different
            question than the one asked. */}
        <Stat label="Pieces sold" value={String(totals.items)} />
        <Stat
          label="Discounts given"
          value={formatPaise(totals.disc)}
          onClick={() =>
            setDrill({
              title: "Bills carrying a discount",
              from, to, locationId: filters.location || null, discountedOnly: true,
            })
          }
        />
      </div>

      <Card>
        <CardHeader className="font-medium">How it was paid</CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-4">
          {(
            [
              ["Cash", totals.cash, "cash"],
              ["UPI", totals.upi, "upi"],
              ["Card", totals.card, "card"],
              ["Other", totals.other, null],
            ] as const
          ).map(([label, value, method]) => (
            <Stat
              key={label}
              label={label}
              value={formatPaise(value)}
              onClick={
                method
                  ? () =>
                      setDrill({
                        title: `Paid by ${label.toLowerCase()}`,
                        from, to, locationId: filters.location || null, method,
                      })
                  : undefined
              }
            />
          ))}
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
                    <button
                      type="button"
                      onClick={() =>
                        setDrill({
                          title: `${b.code} — ${b.name}`,
                          from, to, locationId: b.locationId,
                        })
                      }
                      className="text-left text-sm font-medium hover:text-brand hover:underline"
                    >
                      {b.code} <span className="text-text-muted">{b.name}</span>
                    </button>
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
                    <button
                      type="button"
                      onClick={() =>
                        setDrill({
                          title: `Sold by ${s.staffName}`,
                          from, to,
                          locationId: filters.location || null,
                          staffId: s.staffId,
                        })
                      }
                      className="text-left text-sm font-medium hover:text-brand hover:underline"
                    >
                      {s.staffName}
                    </button>
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
                  <button
                    type="button"
                    onClick={() => setPeek({ id: r.id, no: r.billNo })}
                    className="w-32 text-left font-mono text-2xs text-text-muted hover:text-brand hover:underline"
                  >
                    {r.billNo}
                  </button>
                  <div className="min-w-32 flex-1">
                    <p className="truncate text-sm">
                      {r.customerId ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPeekCustomer({
                              id: r.customerId!,
                              name: r.customerName ?? "Customer",
                            });
                          }}
                          className="hover:text-brand hover:underline"
                        >
                          {r.customerName ?? "Customer"}
                        </button>
                      ) : (
                        "Walk-in"
                      )}
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

      {peek && (
        <BillPeek billId={peek.id} billNo={peek.no} onClose={() => setPeek(null)} />
      )}

      {drill && <BillsBehind spec={drill} onClose={() => setDrill(null)} />}

      {peekCustomer && (
        <CustomerPeek
          customerId={peekCustomer.id}
          name={peekCustomer.name}
          onClose={() => setPeekCustomer(null)}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  big,
  onClick,
}: {
  label: string;
  value: string;
  big?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <p className="text-2xs text-text-muted">{label}</p>
      <p className={`mt-0.5 font-mono ${big ? "text-2xl" : "text-lg"}`}>{value}</p>
      {onClick && <p className="mt-0.5 text-2xs text-brand">see the bills &rsaquo;</p>}
    </>
  );

  if (!onClick) {
    return <div className="rounded-card border border-border bg-surface p-3">{inner}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-card border border-border bg-surface p-3 text-left transition-colors hover:border-brand"
    >
      {inner}
    </button>
  );
}
