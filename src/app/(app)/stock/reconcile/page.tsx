import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { listReconciliation } from "@/features/reconcile/queries";
import { ReconciliationBoard } from "@/features/reconcile/ReconciliationBoard";

export const metadata: Metadata = { title: "Reconcile stock" };

export default async function ReconcilePage() {
  const user = await requireUser();
  if (!can(user, "cost.view")) {
    return <EmptyState title="You do not have access to reconciliation" />;
  }

  const rows = await listReconciliation();

  return (
    <>
      <PageHeader
        title="Reconcile stock"
        description="Balances that disagree with their own history. Each one needs a person to look at the shelf, not a button."
      />
      <ReconciliationBoard rows={rows} />
    </>
  );
}
