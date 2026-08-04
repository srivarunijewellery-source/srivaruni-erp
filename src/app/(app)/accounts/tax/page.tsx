import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { listTaxRates } from "@/features/accounting/queries";
import { TaxEditor } from "@/features/accounting/TaxEditor";

export const metadata: Metadata = { title: "Tax rates" };

export default async function TaxPage() {
  const user = await requireUser();
  if (!can(user, "accounts.manage")) {
    return <EmptyState title="Tax settings are owner-only" />;
  }

  const rates = await listTaxRates();

  return (
    <>
      <PageHeader
        title="Tax rates"
        description="Rates available to pricing, billing and expenses. Within-state splits into CGST and SGST; interstate goes to IGST at the full rate."
      />
      <TaxEditor rates={rates} />
    </>
  );
}
