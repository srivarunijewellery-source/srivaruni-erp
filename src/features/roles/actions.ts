"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

export async function saveRole(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_role", {
    p_id: String(formData.get("id") ?? "") || null,
    p_key: String(formData.get("key") ?? "") || null,
    p_name: String(formData.get("name") ?? ""),
    p_tier: String(formData.get("tier") ?? "staff"),
    p_description: String(formData.get("description") ?? "") || null,
    p_active: formData.get("active") !== null ? formData.get("active") === "on" : true,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.roles);
  return ok(undefined);
}

/** Saves the whole tick-set for a role, not a diff — what's on screen wins. */
export async function setRolePermissions(
  roleId: string,
  keys: string[],
): Promise<Result<number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_role_permissions", {
    p_role: roleId,
    p_keys: keys,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.roles);
  revalidatePath(ROUTES.staff);
  return ok(Number(data ?? 0));
}

export async function assignStaffRole(staffId: string, roleId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_staff_role", {
    p_staff: staffId,
    p_role: roleId,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.staff);
  revalidatePath(ROUTES.staffDetail(staffId));
  return ok(undefined);
}
