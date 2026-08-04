import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getProfitAndLoss } from "@/features/accounting/queries";
import { PnlReport } from "@/features/accounting/AccountingViews";

export const metadata: Metadata = { title: "Profit and loss" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

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
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const defaultTo = now.toISOString().slice(0, 10);

  const start = from && DATE.test(from) ? from : defaultFrom;
  const end = to && DATE.test(to) ? to : defaultTo;

  const rows = await getProfitAndLoss(start, end);

  return (
    <>
      <PageHeader title="Profit and loss" description="Income against costs for a period." />
      <PnlReport rows={rows} from={start} to={end} />
    </>
  );
}
