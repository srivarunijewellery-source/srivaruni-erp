import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { listNotPicked } from "@/features/transfers/notPickedQueries";
import { NotPickedGrid } from "@/features/transfers/NotPickedGrid";

export const metadata: Metadata = { title: "Not packed" };

export default async function NotPickedPage() {
  const user = await requireUser();
  if (!can(user, "transfer.pick")) {
    return <EmptyState title="You do not have access to transfers" />;
  }

  // No location argument: the RPC already limits a staff session to their
  // own store, and the owner should see every store in one list.
  const rows = await listNotPicked();

  return (
    <>
      <PageHeader
        title="Not packed"
        description="Asked for on a transfer, never found, still on the shelf. Tap a card to open the piece."
      />
      <NotPickedGrid rows={rows} />
    </>
  );
}
