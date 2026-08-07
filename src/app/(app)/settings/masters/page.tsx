import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getMasters } from "@/features/masters/queries";
import { MastersEditor } from "@/features/masters/MastersEditor";

export const metadata: Metadata = { title: "Categories & attributes" };

export default async function MastersPage() {
  const user = await requireUser();
  if (!can(user, "catalog.manage")) {
    return (
      <EmptyState
        title="Only the owner can change these"
        hint="Categories, types and attributes decide how every item is filed and priced."
      />
    );
  }

  const data = await getMasters();

  return (
    <>
      <PageHeader
        title="Categories & attributes"
        description="The lists every item is built from. Anything already in use can be renamed or turned off, but not deleted."
      />
      <MastersEditor data={data} />
    </>
  );
}
