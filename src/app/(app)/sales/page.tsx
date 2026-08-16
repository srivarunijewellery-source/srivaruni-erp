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
import { defaultTodayRange, parseDateRange } from "@/lib/dates";

export const metadata: Metadata = { title: "Sales" };

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
  // Real calendar validation in store time, same as the reports. The old
  // regex accepted 2026-13-45 and a half-typed year, and toISOString()
  // put "today" a day out for anyone west of Greenwich.
  const range = parseDateRange(sp.from, sp.to, defaultTodayRange(), { maxDays: 400 });
  const start = range.from;
  const end = range.to;

  const filters = {
    location: sp.location ?? "",
    soldBy: sp.soldBy ?? "",
    status: sp.status === "final" || sp.status === "cancelled" ? sp.status : "",
    q: sp.q ?? "",
  };

  const [branches, registers, recent, sellers, staffList] = await Promise.all([
    getSalesSummary(start, end, filters),
    getRegisterStatus(),
    // 500, not 100: this is the invoice register, and "the last hundred"
    // silently hid older bills inside a date range that clearly asked
    // for them.
    listRecentBills(500, { from: start, to: end, ...filters }),
    getSalespersonReport(start, end, filters.location),
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
