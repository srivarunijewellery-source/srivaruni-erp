import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can, isOwner } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { getMonthReport } from "@/features/staff/queries";
import { PerformanceTable } from "@/features/staff/PerformancePanels";
import { parseDateRange, defaultMonthRange } from "@/lib/dates";

export const metadata: Metadata = { title: "Performance" };

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; month?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "staff.manage")) {
    return <EmptyState title="Performance is owner-only" />;
  }

  const sp = await searchParams;

  // `month` is still honoured so old links and bookmarks keep working —
  // it simply expands to that month's first and last day.
  const legacy = sp.month && /^\d{4}-\d{2}/.test(sp.month) ? sp.month.slice(0, 7) : null;
  const fallback = legacy
    ? {
        from: `${legacy}-01`,
        to: new Date(Number(legacy.slice(0, 4)), Number(legacy.slice(5, 7)), 0)
          .toISOString()
          .slice(0, 10),
      }
    : defaultMonthRange();

  // 400 days so a full year of commission can be run in one go.
  const range = parseDateRange(sp.from, sp.to, fallback, { maxDays: 400 });
  const rows = await getMonthReport(range.from, range.to);

  return (
    <>
      <PageHeader
        title="Performance"
        description="Attendance and sales for the chosen period, per person."
      />

      <div className="mb-4">
        <DateRangePicker
          basePath="/team/performance"
          from={range.from}
          to={range.to}
          maxDays={400}
        />
      </div>

      <PerformanceTable
        rows={rows}
        month={range.from}
        showPay={isOwner(user.role)}
      />
    </>
  );
}
