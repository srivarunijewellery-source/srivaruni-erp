import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { listStaff, listLocationOptions } from "@/features/staff/queries";
import { StaffManager } from "@/features/staff/StaffManager";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ inactive?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "staff.view")) {
    return <EmptyState title="The team pages are for managers and the owner" />;
  }

  const { inactive } = await searchParams;
  const showInactive = inactive === "1";

  const [staff, locations] = await Promise.all([
    listStaff(showInactive),
    listLocationOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Staff"
        description="Everyone who works here, and the details attendance, sales and pay attach to."
      />
      <StaffManager
        staff={staff}
        locations={locations}
        canManage={can(user, "staff.manage")}
        showInactive={showInactive}
      />
    </>
  );
}
