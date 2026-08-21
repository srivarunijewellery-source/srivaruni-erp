import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { listDisplaySections } from "@/features/display/queries";
import { DisplayRack } from "@/features/display/DisplayRack";
import { listStores } from "@/features/inward/queries";

export const metadata: Metadata = { title: "Display" };

/**
 * The rack for one branch.
 *
 * Boduppal only for now: the structure is per store, so Zaheerabad is a
 * different set of sections rather than a different feature.
 */
export default async function DisplayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const stores = await listStores({ allBranches: true });
  const locationId =
    sp.location ?? user.locationId ?? stores[0]?.id ?? "";

  const sections = await listDisplaySections(locationId);
  const store = stores.find((s) => s.id === locationId);

  // Anyone at the counter can rearrange the wall; that is the job.
  const canEdit = can(user, "stock.view");

  return (
    <>
      <PageHeader
        title="Display"
        description={
          store
            ? `${store.name} · what is hanging on each neck`
            : "What is hanging on each neck"
        }
      />

      {sections.length === 0 ? (
        <EmptyState title="No display racks set up for this branch yet" />
      ) : (
        <DisplayRack
          sections={sections}
          locationId={locationId}
          canEdit={canEdit}
        />
      )}
    </>
  );
}
