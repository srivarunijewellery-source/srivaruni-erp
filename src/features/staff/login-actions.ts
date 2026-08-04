"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

/**
 * Creates a login for a staff member and attaches it to their record.
 *
 * Postgres cannot create an auth user, so this is the one staff
 * operation that needs the admin API and therefore the service-role
 * client. The narrow-exception rule still holds: the caller is checked
 * for owner rights against their OWN session first, and only then is
 * the elevated client used, purely to mint the user.
 */
export async function createStaffLogin(formData: FormData): Promise<Result<string>> {
  const staffId = String(formData.get("staffId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!staffId) return err("Missing staff member.");
  if (!email) return err("An email address is needed for the login.");
  if (password.length < 8) return err("Use at least 8 characters.");

  // Authorise against the caller's own session BEFORE touching the
  // admin client. Never trust the form alone for this.
  const supabase = await createClient();
  const { data: me, error: meError } = await supabase.rpc("get_current_staff");
  if (meError) return err(toMessage(meError));

  const role = Array.isArray(me) ? me[0]?.role : (me as { role?: string } | null)?.role;
  if (role !== "owner") return err("Only the owner can assign logins.");

  let admin;
  try {
    admin = createServiceClient();
  } catch (e) {
    return err(toMessage(e, "Login creation is not configured on this deployment."));
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created?.user) {
    return err(createError?.message ?? "Could not create that login.");
  }

  // Attach it. If this fails the auth user would be orphaned, so it is
  // removed again rather than left behind as a login nobody owns.
  const { error: linkError } = await supabase.rpc("link_staff_login", {
    p_staff: staffId,
    p_auth_user: created.user.id,
  });

  if (linkError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return err(toMessage(linkError));
  }

  revalidatePath(ROUTES.staff);
  revalidatePath(ROUTES.staffDetail(staffId));
  return ok(`Login created for ${email}.`);
}

/** Detaches the login without deleting the person or their history. */
export async function unlinkStaffLogin(staffId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("link_staff_login", {
    p_staff: staffId,
    p_auth_user: null,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.staff);
  revalidatePath(ROUTES.staffDetail(staffId));
  return ok(undefined);
}

/** Sends a password reset so the owner never has to know the password. */
export async function resetStaffPassword(email: string): Promise<Result<string>> {
  if (!email) return err("That person has no email address on file.");

  const supabase = await createClient();
  const { data: me } = await supabase.rpc("get_current_staff");
  const role = Array.isArray(me) ? me[0]?.role : (me as { role?: string } | null)?.role;
  if (role !== "owner") return err("Only the owner can reset a password.");

  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) return err(toMessage(error));

  return ok(`Reset link sent to ${email}.`);
}
