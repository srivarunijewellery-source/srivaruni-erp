import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getRegisterStatus,
  getSalesSummary,
  getSalespersonReport,
  listRecentBills,
} from "@/features/pos/dashboard-queries";
import { listSellers } from "@/features/pos/queries";
import { SalesDashboard } from "@/features/pos/SalesDashboard";

export const metadata: Metadata = { title: "Sales" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    location?: string;
    soldBy?: string;
    status?: string;
    q?: string;
  }>;
}) {
  const user = await requireUser();
  if (!can(user, "stock.view")) {
    return <EmptyState title="You do not have access to sales figures" />;
  }

  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const start = sp.from && DATE.test(sp.from) ? sp.from : today;
  const end = sp.to && DATE.test(sp.to) ? sp.to : today;

  const filters = {
    location: sp.location ?? "",
    soldBy: sp.soldBy ?? "",
    status: sp.status === "final" || sp.status === "cancelled" ? sp.status : "",
    q: sp.q ?? "",
  };

  const [branches, registers, recent, sellers, staffList] = await Promise.all([
    getSalesSummary(start, end),
    getRegisterStatus(),
    listRecentBills(100, { from: start, to: end, ...filters }),
    getSalespersonReport(start, end),
    listSellers(user.locationId ?? ""),
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
        sellers={sellers}
        staffList={staffList}
        from={start}
        to={end}
        filters={filters}
      />
    </>
  );
}
