import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/types/domain";

/**
 * The signed-in staff member, resolved once per request.
 *
 * React's cache() dedupes this across every server component in a render,
 * so the layout, the page and any nested component share one round trip
 * rather than three. Latency to Mumbai is the budget we are protecting.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("staff")
    .select("id, name, role, home_location_id, locations(id, code)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error || !data) return null;

  const location = Array.isArray(data.locations) ? data.locations[0] : data.locations;

  return {
    staffId: data.id,
    authUserId: user.id,
    name: data.name,
    role: data.role,
    locationId: data.home_location_id,
    locationCode: location?.code ?? null,
  };
});

/** For server components that cannot render without a user. Middleware
 *  already redirects, so reaching this means something is inconsistent. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error(
      "Signed in, but no staff record is linked to this login. Ask the owner to add you.",
    );
  }
  return user;
}
