import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { listPermissions, listRoles } from "@/features/roles/queries";
import { RoleEditor } from "@/features/roles/RoleEditor";

export const metadata: Metadata = { title: "Roles" };

export default async function RolesPage() {
  const user = await requireUser();
  if (!can(user, "roles.manage")) {
    return <EmptyState title="Roles are owner-only" />;
  }

  const [roles, permissions] = await Promise.all([listRoles(), listPermissions()]);

  return (
    <>
      <PageHeader
        title="Roles"
        description="Who can do what. Changes take effect on the next page load — no deploy."
      />
      <RoleEditor roles={roles} permissions={permissions} />
    </>
  );
}
