import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getRegisterStatus,
  getSalesSummary,
  listRecentBills,
} from "@/features/pos/dashboard-queries";
import { SalesDashboard } from "@/features/pos/SalesDashboard";

export const metadata: Metadata = { title: "Sales" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "stock.view")) {
    return <EmptyState title="You do not have access to sales figures" />;
  }

  const { from, to } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const start = from && DATE.test(from) ? from : today;
  const end = to && DATE.test(to) ? to : today;

  const [branches, registers, recent] = await Promise.all([
    getSalesSummary(start, end),
    getRegisterStatus(),
    listRecentBills(50),
  ]);

  return (
    <>
      <PageHeader
        title="Sales"
        description="What every branch has taken, and what is in each drawer right now."
      />
      <SalesDashboard
        branches={branches}
        registers={registers}
        recent={recent}
        from={start}
        to={end}
      />
    </>
  );
}
