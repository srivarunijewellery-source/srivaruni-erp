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

/**
 * Detaches the login without deleting the person or their history.
 *
 * The auth user is deleted too, not just unhooked. Leaving it behind
 * kept the address registered, so giving the same person their login
 * back with the same address failed with "already registered" and there
 * was no screen anywhere that could explain why. The staff row, their
 * attendance and their sales all stay exactly where they are.
 */
export async function unlinkStaffLogin(staffId: string): Promise<Result> {
  const supabase = await createClient();

  const { data: me } = await supabase.rpc("get_current_staff");
  const role = Array.isArray(me) ? me[0]?.role : (me as { role?: string } | null)?.role;
  if (role !== "owner") return err("Only the owner can remove a login.");

  const { data: row } = await supabase
    .from("staff")
    .select("auth_user_id")
    .eq("id", staffId)
    .maybeSingle();

  const { error } = await supabase.rpc("link_staff_login", {
    p_staff: staffId,
    p_auth_user: null,
  });
  if (error) return err(toMessage(error));

  // Detaching already revokes access, because get_current_staff finds no
  // row. Deleting the auth user is about freeing the address, so this
  // failing is untidy rather than unsafe.
  if (row?.auth_user_id) {
    try {
      const admin = createServiceClient();
      await admin.auth.admin.deleteUser(row.auth_user_id);
    } catch {
      // Left registered. The owner will find out only if they try to
      // reuse the address, which is the moment it matters.
    }
  }

  revalidatePath(ROUTES.staff);
  revalidatePath(ROUTES.staffDetail(staffId));
  return ok(undefined);
}

/**
 * Sends a password reset link.
 *
 * Only useful when the sign-in address is a real inbox. Most staff here
 * are given a made-up srivaruni.com address purely as a username, and a
 * link sent there goes nowhere -- Supabase reports success regardless,
 * to stop people probing which accounts exist. For those, the owner
 * setting a password directly is the actual recovery path.
 */
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

/**
 * Sets a password directly, without a reset email.
 *
 * A reset link is the right default, but it is useless to someone
 * standing at the counter locked out with no access to the inbox the
 * login was created against — which, for shop staff, is common. Owner
 * only, checked against the caller's own session before the admin
 * client is touched, exactly as createStaffLogin does.
 */
export async function setStaffPassword(formData: FormData): Promise<Result<string>> {
  const staffId = String(formData.get("staffId") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!staffId) return err("Missing staff member.");
  if (password.length < 8) return err("Use at least 8 characters.");

  const supabase = await createClient();
  const { data: me, error: meError } = await supabase.rpc("get_current_staff");
  if (meError) return err(toMessage(meError));

  const role = Array.isArray(me) ? me[0]?.role : (me as { role?: string } | null)?.role;
  if (role !== "owner") return err("Only the owner can change a login.");

  const { data: row, error: rowError } = await supabase
    .from("staff")
    .select("auth_user_id, name")
    .eq("id", staffId)
    .maybeSingle();

  if (rowError || !row?.auth_user_id) {
    return err("That person has no login to change.");
  }

  let admin;
  try {
    admin = createServiceClient();
  } catch (e) {
    return err(toMessage(e, "Login changes are not configured on this deployment."));
  }

  const { error } = await admin.auth.admin.updateUserById(row.auth_user_id, { password });
  if (error) return err(error.message);

  revalidatePath(ROUTES.staffDetail(staffId));
  return ok(`Password set. Give it to ${row.name} directly and have them change it.`);
}
