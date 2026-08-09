import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/types/domain";

/**
 * Why this returns a tagged result rather than `CurrentUser | null`:
 *
 * There are two completely different reasons resolution can fail, and
 * the first version of this file collapsed both into `null`. The caller
 * then reported "signed in, but no staff record" for BOTH — including
 * when the real problem was that no session reached the server at all.
 * That single wrong message sent an entire debugging session after a
 * database fault that did not exist. Distinguish the cases.
 */
export type SessionResult =
  | { status: "ok"; user: CurrentUser }
  | { status: "no-session" }
  | { status: "no-staff-record"; authUserId: string; email: string | null }
  | { status: "error"; message: string };

export const resolveSession = cache(async (): Promise<SessionResult> => {
  const supabase = await createClient();

  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError) {
    // Not being signed in is not an error.
    //
    // getUser() raises AuthSessionMissingError when there is no session
    // at all, rather than returning user: null. Treated as a failure it
    // showed a signed-out visitor "Could not load your account — Auth
    // session missing", which reads like the system is broken when the
    // truth is simply that nobody has signed in yet.
    const missing =
      authError.name === "AuthSessionMissingError" ||
      /session (missing|from session id)/i.test(authError.message ?? "");
    if (missing) return { status: "no-session" };

    return { status: "error", message: `Auth check failed: ${authError.message}` };
  }
  if (!userData.user) {
    return { status: "no-session" };
  }

  // One RPC instead of a PostgREST embed across two RLS-protected
  // tables. Fewer moving parts, and a real error instead of an
  // ambiguous empty result.
  const { data, error } = await supabase.rpc("get_current_staff");

  if (error) {
    return { status: "error", message: `Staff lookup failed: ${error.message}` };
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    return {
      status: "no-staff-record",
      authUserId: userData.user.id,
      email: userData.user.email ?? null,
    };
  }

  // Permissions come from the database rather than being inferred from
  // the role name, so a role edited in the admin screen takes effect on
  // the next request instead of at the next deploy.
  const { data: permRows } = await supabase.rpc("my_permissions");
  const permissions = new Set<string>(
    ((permRows ?? []) as Array<{ permission_key: string }>).map((r) => r.permission_key),
  );

  return {
    status: "ok",
    user: {
      permissions,
      roleName: row.role_name ?? row.role,
      roleKey: row.role_key ?? row.role,
      staffId: row.staff_id,
      authUserId: row.auth_user_id,
      name: row.name,
      role: row.role,
      locationId: row.location_id,
      locationCode: row.location_code,
    },
  };
});

/** Convenience for components that just want the user or nothing. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const result = await resolveSession();
  return result.status === "ok" ? result.user : null;
});

/**
 * For server components that cannot render without a user.
 *
 * Each branch says what actually happened. Next.js strips these messages
 * in production builds, so the app shell also renders them directly
 * rather than relying on the error boundary alone.
 */
export async function requireUser(): Promise<CurrentUser> {
  const result = await resolveSession();

  switch (result.status) {
    case "ok":
      return result.user;
    case "no-session":
      throw new Error(
        "Your session has expired or did not reach the server. Sign in again.",
      );
    case "no-staff-record":
      throw new Error(
        `Signed in as ${result.email ?? result.authUserId}, but no staff record is linked to this login. Ask the owner to add you.`,
      );
    case "error":
      throw new Error(result.message);
  }
}
