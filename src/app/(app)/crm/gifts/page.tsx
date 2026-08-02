import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { listGiftOffers, allocateGifts } from "@/features/gifts/queries";
import { GiftOfferManager } from "@/features/gifts/GiftOfferManager";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Gift offers" };

export default async function GiftsPage() {
  const [user, offers] = await Promise.all([requireUser(), listGiftOffers()]);

  // Preview at the sum of every threshold: the smallest bill that can
  // earn one of everything. Shows what the budget rule produces rather
  // than describing it in prose.
  const sumOfThresholds = offers
    .filter((o) => o.live)
    .reduce((n, o) => n + o.thresholdPaise, 0);
  const preview = sumOfThresholds > 0 ? await allocateGifts(sumOfThresholds) : [];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "CRM", href: ROUTES.customers }, { label: "Gift offers" }]}
        title="Gift offers"
        description="Give an item away once a bill reaches a value. These stack with each other."
      />
      <GiftOfferManager
        offers={offers}
        canManage={can(user.role, "discount.manage")}
        preview={preview}
        previewAtPaise={sumOfThresholds}
      />
    </>
  );
}
