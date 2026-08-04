import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getTrialBalance, getUnposted } from "@/features/accounting/queries";
import { TrialBalanceTable, UnpostedWarning } from "@/features/accounting/AccountingViews";

export const metadata: Metadata = { title: "Trial balance" };

export default async function TrialBalancePage() {
  const user = await requireUser();
  if (!can(user, "accounts.view")) {
    return <EmptyState title="The books are owner-only" />;
  }

  const [rows, unposted] = await Promise.all([getTrialBalance(), getUnposted()]);

  return (
    <>
      <PageHeader
        title="Trial balance"
        description="Where every account stands right now."
      />
      <div className="space-y-4">
        <UnpostedWarning rows={unposted} />
        <TrialBalanceTable rows={rows} />
      </div>
    </>
  );
}
