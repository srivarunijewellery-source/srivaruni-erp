import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { isOwner } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getReportCatalog } from "@/features/reports/queries";
import { ReportRunner } from "@/features/reports/ReportRunner";
import { listStores } from "@/features/inward/queries";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const user = await requireUser();
  if (!isOwner(user.role)) {
    return (
      <EmptyState
        title="Reports are owner-only"
        hint="They carry cost and margin across every branch."
      />
    );
  }

  const [catalog, stores] = await Promise.all([getReportCatalog(), listStores()]);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Pick a subject and a window. Read it here, or take the whole thing away as a spreadsheet."
      />
      <ReportRunner catalog={catalog} branches={stores} />
    </>
  );
}
