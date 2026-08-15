import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { listPriceChecks } from "@/features/pricecheck/queries";
import { PriceCheckGrid } from "@/features/pricecheck/PriceCheckGrid";

export const metadata: Metadata = { title: "Price check" };

export default async function PriceCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ min?: string; dev?: string }>;
}) {
  const user = await requireUser();
  // Cost is owner-gated at the database level, and every row here shows
  // one — so the page is too.
  if (!can(user, "cost.view")) {
    return <EmptyState title="You do not have access to pricing review" />;
  }

  const { min = "1.3", dev = "0.4" } = await searchParams;
  const rows = await listPriceChecks(Number(min) || 1.3, Number(dev) || 0.4);

  return (
    <>
      <PageHeader
        title="Price check"
        description="Pieces earning too little, or priced unlike the rest of their category. Set a new price on the row."
      />
      <PriceCheckGrid rows={rows} />
    </>
  );
}
