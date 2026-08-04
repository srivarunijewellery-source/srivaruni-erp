import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { listAccounts } from "@/features/accounting/queries";
import { ChartEditor } from "@/features/accounting/ChartEditor";

export const metadata: Metadata = { title: "Chart of accounts" };

export default async function ChartPage() {
  const user = await requireUser();
  if (!can(user, "accounts.manage")) {
    return <EmptyState title="The chart of accounts is owner-only" />;
  }

  const accounts = await listAccounts();

  return (
    <>
      <PageHeader
        title="Chart of accounts"
        description="Every rupee that moves lands on two of these."
      />
      <ChartEditor accounts={accounts} />
    </>
  );
}
