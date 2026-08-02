import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { listGiftOffers, previewGifts } from "@/features/gifts/queries";
import { GiftOfferManager } from "@/features/gifts/GiftOfferManager";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Gift offers" };

export default async function GiftsPage() {
  const [user, offers] = await Promise.all([requireUser(), listGiftOffers()]);

  // Preview at a bill value above every threshold, so the page can show
  // exactly what stacking produces rather than describing it in prose.
  const highest = offers.reduce((n, o) => Math.max(n, o.thresholdPaise), 0);
  const preview = highest > 0 ? await previewGifts(highest) : [];

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
        previewAtPaise={highest}
      />
    </>
  );
}
