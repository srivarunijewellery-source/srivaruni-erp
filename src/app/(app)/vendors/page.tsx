import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { listVendorDetails } from "@/features/vendors/queries";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { VendorList } from "@/features/vendors/VendorList";

export const metadata: Metadata = { title: "Vendors" };

export default async function VendorsPage() {
  const user = await requireUser();

  if (!can(user, "vendor.view")) {
    return (
      <EmptyState
        title="Vendors are not available to your role"
        hint="Vendor records carry payment terms and tax configuration. Ask the owner if you need access."
      />
    );
  }

  const vendors = await listVendorDetails();

  return (
    <>
      <PageHeader
        title="Vendors"
        description="Tax setup here decides how every purchase rate from this vendor is read."
      />
      {vendors.length === 0 ? (
        <EmptyState title="No vendors yet" hint="Add your first supplier to start recording goods." />
      ) : (
        <VendorList vendors={vendors} />
      )}
    </>
  );
}
