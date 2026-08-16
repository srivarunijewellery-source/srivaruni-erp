import { ReturnCustomerPicker } from "@/features/returns/ReturnCustomerPicker";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterBar } from "@/components/ui/FilterBar";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { listCreditNotes, listSalesReturns } from "@/features/returns/queries";
import { listStores } from "@/features/inward/queries";

export const metadata: Metadata = { title: "Returns" };

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; location?: string; q?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "stock.view")) {
    return <EmptyState title="Returns are for managers and the owner" />;
  }

  const { from = "", to = "", location = "", q = "" } = await searchParams;

  const [returns, credits, stores] = await Promise.all([
    listSalesReturns({ from, to, location, q }),
    listCreditNotes(true),
    listStores(),
  ]);

  const outstanding = credits.reduce((s, c) => s + c.balancePaise, 0);
  const returned = returns.reduce((s, r) => s + r.totalPaise, 0);

  return (
    <>
      <PageHeader
        title="Returns"
        description="Pieces that came back, and the credit sitting against customers because of it."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Card>
          <CardBody>
            <p className="text-2xs uppercase tracking-wide text-text-muted">
              Credit outstanding
            </p>
            <p className="tnum font-mono text-2xl">{formatPaise(outstanding)}</p>
            <p className="text-2xs text-text-subtle">
              {credits.length} note{credits.length === 1 ? "" : "s"} customers can still
              spend. This is a liability, not a cost.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-2xs uppercase tracking-wide text-text-muted">
              Returned in this window
            </p>
            <p className="tnum font-mono text-2xl">{formatPaise(returned)}</p>
            <p className="text-2xs text-text-subtle">
              across {returns.length} return{returns.length === 1 ? "" : "s"}
            </p>
          </CardBody>
        </Card>
      </div>

      <FilterBar
        basePath={ROUTES.returns}
        value={{ from, to, location, q }}
        searchLabel="Return number"
        searchPlaceholder="RET/2608/…"
        selects={[
          {
            key: "location",
            label: "Store",
            allLabel: "All stores",
            options: stores.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })),
          },
        ]}
      />

      <Card className="mb-4">
        <CardHeader className="font-medium">Returns</CardHeader>
        <CardBody className="p-0">
          {returns.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-text-muted">
              Nothing has come back yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {returns.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{r.returnNo}</span>
                      {r.billNo && (
                        <span className="text-2xs text-text-muted">against {r.billNo}</span>
                      )}
                      {r.locationCode && <Badge tone="neutral">{r.locationCode}</Badge>}
                    </span>
                    <span className="block truncate text-2xs text-text-muted">
                      {formatDate(r.returnDate)}
                      
                      {r.customerName ? ` · ${r.customerName}` : " · nobody attached"} ·{" "}
                      {r.pieces} piece
                      {r.pieces === 1 ? "" : "s"}
                      {r.reason ? ` · ${r.reason}` : ""}
                      {r.staffName ? ` · ${r.staffName}` : ""}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="tnum font-mono text-sm">
                      {formatPaise(r.totalPaise)}
                    </span>
                    {/* Fixes the gap that made someone cancel a whole
                        bill to get a customer onto a return. */}
                    <ReturnCustomerPicker
                      returnId={r.id}
                      returnNo={r.returnNo}
                      current={r.customerName}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="font-medium">Credit customers can still spend</CardHeader>
        <CardBody className="p-0">
          {credits.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-text-muted">
              No credit outstanding.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {credits.map((c) => (
                <li
                  key={c.creditNoteId}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-sm font-medium">{c.noteNo}</span>
                    <span className="block truncate text-2xs text-text-muted">
                      <Link
                        href={ROUTES.customerDetail(c.customerId)}
                        className="hover:text-brand hover:underline"
                      >
                        {c.customerName ?? c.customerPhone ?? "customer"}
                      </Link>
                      {c.returnNo ? ` · from ${c.returnNo}` : ""}
                      {c.spentPaise > 0 ? ` · ${formatPaise(c.spentPaise)} used` : ""}
                      {c.validUntil ? ` · good until ${formatDate(c.validUntil)}` : ""}
                    </span>
                  </span>
                  <span className="tnum font-mono text-sm">
                    {formatPaise(c.balancePaise)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
