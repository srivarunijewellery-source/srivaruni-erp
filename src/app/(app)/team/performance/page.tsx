import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can, isOwner } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getMonthReport } from "@/features/staff/queries";
import { PerformanceTable } from "@/features/staff/PerformancePanels";

export const metadata: Metadata = { title: "Performance" };

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "staff.manage")) {
    return <EmptyState title="Performance is owner-only" />;
  }

  const { month } = await searchParams;
  const period =
    month && /^\d{4}-\d{2}/.test(month)
      ? `${month.slice(0, 7)}-01`
      : `${new Date().toISOString().slice(0, 7)}-01`;

  const rows = await getMonthReport(period);

  return (
    <>
      <PageHeader
        title="Performance"
        description="Attendance and sales for the month, per person."
      />
      <PerformanceTable rows={rows} month={period} showPay={isOwner(user.role)} />
    </>
  );
}
