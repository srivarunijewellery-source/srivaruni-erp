import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getGstSummary, getUnposted } from "@/features/accounting/queries";
import { GstReport } from "@/features/accounting/GstReport";
import { defaultMonthRange, parseDateRange } from "@/lib/dates";

export const metadata: Metadata = { title: "GST summary" };

export default async function GstPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "accounts.view")) {
    return <EmptyState title="The books are owner-only" />;
  }

  const { from, to } = await searchParams;
  // Same reasoning as the profit and loss page: a real calendar check,
  // clamped to a sane window, defaulting to the current month in STORE
  // time rather than whatever UTC thinks the month started.
  const range = parseDateRange(from, to, defaultMonthRange(), { maxDays: 400 });

  const [rows, unposted] = await Promise.all([
    getGstSummary(range.from, range.to),
    getUnposted(),
  ]);

  return (
    <>
      <PageHeader
        title="GST summary"
        description="Tax collected, credit claimable, and what is left to pay."
      />
      <GstReport
        rows={rows.ok ? rows.data : []}
        from={range.from}
        to={range.to}
        unpostedCount={unposted.length}
        error={rows.ok ? null : rows.error}
        adjusted={range.adjusted}
      />
    </>
  );
}
