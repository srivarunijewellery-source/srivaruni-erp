import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getBusinessSettings,
  listBankAccounts,
  listBranchesAdmin,
} from "@/features/settings/queries";
import { listTills } from "@/features/pos/queries";
import { CompanySettings } from "@/features/settings/CompanySettings";
import { LabourRateCard } from "@/features/assembly/LabourRateCard";
import { getLabourRate } from "@/features/assembly/queries";

export const metadata: Metadata = { title: "Company" };

export default async function CompanyPage() {
  const user = await requireUser();
  if (!can(user, "settings.manage")) {
    return <EmptyState title="Company settings are owner-only" />;
  }

  const [business, branches, banks, tills, labourRate] = await Promise.all([
    getBusinessSettings(),
    listBranchesAdmin(),
    listBankAccounts(),
    listTills(),
    // Used to cost in-house assembly work.
    getLabourRate(),
  ]);

  if (!business) return <EmptyState title="Company settings are missing." />;

  return (
    <>
      <PageHeader
        title="Company"
        description="Identity, branches and bank details. These appear on every invoice."
      />
      <CompanySettings
        business={business}
        branches={branches}
        banks={banks}
        tills={tills.map((t) => ({ id: t.id, name: t.name }))}
      />
      <div className="mt-4">
        <LabourRateCard ratePaise={labourRate} />
      </div>
    </>
  );
}
