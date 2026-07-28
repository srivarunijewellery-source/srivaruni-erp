import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { listVendors, listStores } from "@/features/inward/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { NewInwardForm } from "@/features/inward/NewInwardForm";

export const metadata: Metadata = { title: "Record goods received" };

export default async function NewInwardPage() {
  const user = await requireUser();
  const [vendors, stores] = await Promise.all([listVendors(), listStores()]);

  return (
    <>
      <PageHeader
        title="Record goods received"
        description="Open the document first, then add items as you unpack. Nothing posts to stock until the owner prices it."
      />
      <NewInwardForm
        vendors={vendors}
        stores={stores}
        defaultLocationId={user.locationId}
      />
    </>
  );
}
