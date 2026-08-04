import { createClient } from "@/lib/supabase/server";

export interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  tier: "owner" | "manager" | "staff";
  isSystem: boolean;
  active: boolean;
  permissionKeys: string[];
  staffCount: number;
}

export interface PermissionRow {
  key: string;
  label: string;
  groupLabel: string;
  description: string | null;
  ownerOnly: boolean;
}

export async function listPermissions(): Promise<PermissionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permissions")
    .select("key, label, group_label, description, owner_only, sort_order")
    .order("sort_order");
  if (error) return [];

  return (data ?? []).map((r) => ({
    key: r.key,
    label: r.label,
    groupLabel: r.group_label,
    description: r.description,
    ownerOnly: Boolean(r.owner_only),
  }));
}

export async function listRoles(): Promise<RoleRow[]> {
  const supabase = await createClient();

  const [rolesRes, permsRes, staffRes] = await Promise.all([
    supabase
      .from("roles")
      .select("id, key, name, description, tier, is_system, active, sort_order")
      .order("sort_order"),
    supabase.from("role_permissions").select("role_id, permission_key"),
    supabase.from("staff").select("role_id").eq("active", true),
  ]);

  if (rolesRes.error) return [];

  const byRole = new Map<string, string[]>();
  for (const p of permsRes.data ?? []) {
    const list = byRole.get(p.role_id) ?? [];
    list.push(p.permission_key);
    byRole.set(p.role_id, list);
  }

  const counts = new Map<string, number>();
  for (const s of staffRes.data ?? []) {
    if (!s.role_id) continue;
    counts.set(s.role_id, (counts.get(s.role_id) ?? 0) + 1);
  }

  return (rolesRes.data ?? []).map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    tier: r.tier as RoleRow["tier"],
    isSystem: Boolean(r.is_system),
    active: Boolean(r.active),
    permissionKeys: byRole.get(r.id) ?? [],
    staffCount: counts.get(r.id) ?? 0,
  }));
}
