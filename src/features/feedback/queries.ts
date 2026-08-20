import { createClient } from "@/lib/supabase/server";

export interface FeedbackType {
  id: string;
  key: string;
  label: string;
  hint: string | null;
}

export interface FeedbackEntry {
  id: string;
  typeLabel: string;
  typeKey: string;
  locationCode: string;
  description: string;
  onDate: string;
  loggedBy: string;
  loggedAt: string;
  actioned: boolean;
  actionedBy: string | null;
  actionedAt: string | null;
  actionedNote: string | null;
}

export interface FeedbackFilters {
  type?: string;
  location?: string;
  from?: string;
  to?: string;
  /** "open", "actioned", or unset for both. */
  state?: string;
}

/** The kinds a note can be. A table, so a new one is a row not a deploy. */
export async function listFeedbackTypes(): Promise<FeedbackType[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_types")
    .select("id, key, label, hint")
    .eq("active", true)
    .order("sort_order");

  if (error) return [];
  return (data ?? []).map((t) => ({
    id: t.id,
    key: t.key,
    label: t.label,
    hint: t.hint,
  }));
}

/**
 * Notes for the admin screen.
 *
 * RLS decides visibility: the owner sees both branches, everyone else
 * sees their own. So nothing here filters by location for safety --
 * only because you asked to narrow it.
 *
 * Open notes first, then newest, because the list exists to be worked
 * through rather than read. A note ticked last week should not sit
 * above one raised this morning.
 */
export async function listFeedback(
  filters: FeedbackFilters = {},
  limit = 200,
): Promise<FeedbackEntry[]> {
  const supabase = await createClient();

  let q = supabase
    .from("feedback_entries")
    .select(
      `id, description, on_date, logged_at, actioned, actioned_at, actioned_note,
       feedback_types(key, label),
       locations(code),
       logged:logged_by(name),
       marked:actioned_by(name)`,
    )
    .order("actioned")
    .order("on_date", { ascending: false })
    .order("logged_at", { ascending: false })
    .limit(limit);

  if (filters.type) q = q.eq("feedback_types.key", filters.type);
  if (filters.location) q = q.eq("location_id", filters.location);
  if (filters.from) q = q.gte("on_date", filters.from);
  if (filters.to) q = q.lte("on_date", filters.to);
  if (filters.state === "open") q = q.eq("actioned", false);
  if (filters.state === "actioned") q = q.eq("actioned", true);

  const { data, error } = await q;
  if (error) return [];

  const one = <T,>(v: T | T[] | null): T | undefined =>
    Array.isArray(v) ? v[0] : (v ?? undefined);

  return (data ?? [])
    .map((r) => {
      const t = one(r.feedback_types as never) as
        | { key: string; label: string }
        | undefined;
      return {
        id: r.id as string,
        typeKey: t?.key ?? "",
        typeLabel: t?.label ?? "—",
        locationCode: (one(r.locations as never) as { code: string } | undefined)?.code ?? "—",
        description: r.description as string,
        onDate: r.on_date as string,
        loggedBy: (one(r.logged as never) as { name: string } | undefined)?.name ?? "—",
        loggedAt: r.logged_at as string,
        actioned: Boolean(r.actioned),
        actionedBy: (one(r.marked as never) as { name: string } | undefined)?.name ?? null,
        actionedAt: (r.actioned_at as string | null) ?? null,
        actionedNote: (r.actioned_note as string | null) ?? null,
      };
    })
    // A type filter on an embedded table narrows the embed, not the
    // rows, so a non-matching row arrives with a null type rather than
    // being excluded. Dropped here.
    .filter((r) => !filters.type || r.typeKey === filters.type);
}

/** How many notes are still open, for the badge on the counter button. */
export async function countOpenFeedback(locationId?: string): Promise<number> {
  const supabase = await createClient();
  let q = supabase
    .from("feedback_entries")
    .select("id", { count: "exact", head: true })
    .eq("actioned", false);
  if (locationId) q = q.eq("location_id", locationId);
  const { count } = await q;
  return count ?? 0;
}
