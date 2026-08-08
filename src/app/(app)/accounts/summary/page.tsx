import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { isOwner } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatPaise } from "@/lib/money";
import { listStores } from "@/features/inward/queries";
import { getFinanceSummary } from "@/features/finance/queries";
import { SummaryCards } from "@/features/finance/SummaryCards";
import { DateRangeBar } from "@/features/dashboard/DateRangeBar";
import { monthStart, todayIso } from "@/lib/dates";

export const metadata: Metadata = { title: "Financial summary" };

export default async function FinanceSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; location?: string }>;
}) {
  const user = await requireUser();
  if (!isOwner(user.role)) {
    return (
      <EmptyState
        title="The money is owner-only"
        hint="It shows cost, margin and cash across every branch."
      />
    );
  }

  const sp = await searchParams;
  const from = sp.from || monthStart(todayIso());
  const to = sp.to || todayIso();
  const location = sp.location || "";

  const [summary, stores] = await Promise.all([
    getFinanceSummary(from, to, location || null),
    listStores(),
  ]);

  return (
    <>
      <PageHeader
        title="Financial summary"
        description="Where the money is, where it came from, and where it went."
      />

      <DateRangeBar
        basePath={ROUTES.financeSummary}
        params={{ location }}
        from={from}
        to={to}
      />

      {stores.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <Link
            href={`${ROUTES.financeSummary}?from=${from}&to=${to}`}
            className={`rounded-control border px-3 py-1.5 text-2xs ${
              location ? "border-border" : "border-brand text-brand"
            }`}
          >
            All branches
          </Link>
          {stores.map((s) => (
            <Link
              key={s.id}
              href={`${ROUTES.financeSummary}?from=${from}&to=${to}&location=${s.id}`}
              className={`rounded-control border px-3 py-1.5 text-2xs ${
                location === s.id ? "border-brand text-brand" : "border-border"
              }`}
            >
              {s.code}
            </Link>
          ))}
        </div>
      )}

      <SummaryCards
        summary={summary}
        from={from}
        to={to}
        location={location || null}
      />

      {/* The books are only as right as what has been posted into them,
          so the way to fix anything is one click from the numbers it
          affects rather than buried three screens away. */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">Something look wrong?</span>
          <Link
            href={ROUTES.journals}
            className="rounded-control border border-border px-3 py-1.5 text-2xs hover:border-brand hover:text-brand"
          >
            Journal — post an adjustment
          </Link>
          <Link
            href={ROUTES.trialBalance}
            className="rounded-control border border-border px-3 py-1.5 text-2xs hover:border-brand hover:text-brand"
          >
            Trial balance
          </Link>
          <Link
            href={ROUTES.pnl}
            className="rounded-control border border-border px-3 py-1.5 text-2xs hover:border-brand hover:text-brand"
          >
            Profit and loss
          </Link>
          <Link
            href={ROUTES.gst}
            className="rounded-control border border-border px-3 py-1.5 text-2xs hover:border-brand hover:text-brand"
          >
            GST
          </Link>
          <Link
            href={ROUTES.expenses}
            className="rounded-control border border-border px-3 py-1.5 text-2xs hover:border-brand hover:text-brand"
          >
            Record an expense
          </Link>
        </CardBody>
      </Card>

      {summary.bankPaise < 0 && (
        <Card className="mt-4">
          <CardBody>
            <p className="text-sm font-medium text-status-pending-fg">
              Bank is negative by {formatPaise(Math.abs(summary.bankPaise))}
            </p>
            <p className="mt-1 text-2xs text-text-muted">
              Expenses paid from the bank have been recorded, but the deposits that
              funded them have not — every migrated sale posted as cash. Post the
              deposits in the journal (debit Bank, credit Cash) and this clears.
            </p>
            <Link
              href={ROUTES.journals}
              className="mt-2 inline-block rounded-control border border-border px-3 py-1.5 text-2xs hover:border-brand hover:text-brand"
            >
              Post the deposits
            </Link>
          </CardBody>
        </Card>
      )}
    </>
  );
}
