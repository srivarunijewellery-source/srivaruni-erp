import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getUnposted, listJournals } from "@/features/accounting/queries";
import { JournalList, UnpostedWarning } from "@/features/accounting/AccountingViews";

export const metadata: Metadata = { title: "Journal" };

export default async function JournalsPage() {
  const user = await requireUser();
  if (!can(user.role, "accounts.view")) {
    return <EmptyState title="The books are owner-only" />;
  }

  const [entries, unposted] = await Promise.all([listJournals(), getUnposted()]);

  return (
    <>
      <PageHeader
        title="Journal"
        description="Every entry, in the order it was posted."
      />
      <div className="space-y-4">
        <UnpostedWarning rows={unposted} />
        <JournalList entries={entries} />
      </div>
    </>
  );
}
