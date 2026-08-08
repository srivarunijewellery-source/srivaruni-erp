import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getProfitAndLoss } from "@/features/accounting/queries";
import { PnlReport } from "@/features/accounting/AccountingViews";
import { defaultMonthRange, parseDateRange } from "@/lib/dates";

export const metadata: Metadata = { title: "Profit and loss" };

export default async function PnlPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "accounts.view")) {
    return <EmptyState title="The books are owner-only" />;
  }

  const { from, to } = await searchParams;

  // parseDateRange, not a shape check.
  //
  // The old guard was /^\d{4}-\d{2}-\d{2}$/, which passes 2026-13-45
  // straight to Postgres (a 500) and passes 0002-08-07 as a perfectly
  // valid date asking for two thousand years of ledger. A date input
  // emits exactly that while the year is still being typed, and the
  // full-history query takes 1.5 seconds — several at once is what blew
  // the statement timeout.
  //
  // 400 days caps it at a financial year plus a margin. Anything longer
  // is a report to run deliberately, not by mistyping a year.
  const range = parseDateRange(from, to, defaultMonthRange(), { maxDays: 400 });

  const result = await getProfitAndLoss(range.from, range.to);

  return (
    <>
      <PageHeader title="Profit and loss" description="Income against costs for a period." />
      <PnlReport
        rows={result.ok ? result.data : []}
        from={range.from}
        to={range.to}
        error={result.ok ? null : result.error}
        adjusted={range.adjusted}
      />
    </>
  );
}
