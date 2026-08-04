import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getGstSummary, getUnposted } from "@/features/accounting/queries";
import { GstReport } from "@/features/accounting/GstReport";

export const metadata: Metadata = { title: "GST summary" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function GstPage({
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
  const defFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const defTo = now.toISOString().slice(0, 10);

  const start = from && DATE.test(from) ? from : defFrom;
  const end = to && DATE.test(to) ? to : defTo;

  const [rows, unposted] = await Promise.all([getGstSummary(start, end), getUnposted()]);

  return (
    <>
      <PageHeader
        title="GST summary"
        description="Tax collected, credit claimable, and what is left to pay."
      />
      <GstReport rows={rows} from={start} to={end} unpostedCount={unposted.length} />
    </>
  );
}
