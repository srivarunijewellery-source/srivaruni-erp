import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPrintConfig } from "@/features/print/queries";
import { PrintSettingsForm } from "@/features/print/PrintSettingsForm";

export const metadata: Metadata = { title: "Print configuration" };

export default async function PrintSettingsPage() {
  const user = await requireUser();
  if (!can(user, "settings.manage")) {
    return <EmptyState title="Only the owner can change print settings" />;
  }

  const config = await getPrintConfig();

  return (
    <>
      <PageHeader
        title="Print configuration"
        description="How the customer's slip looks. Change something, print one, look at it."
      />
      <PrintSettingsForm config={config} />
    </>
  );
}
