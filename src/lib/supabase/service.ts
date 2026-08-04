import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * THE ONLY SERVICE-ROLE CLIENT IN THIS CODEBASE.
 *
 * Every other path talks to Postgres as the signed-in user, because
 * service_role bypasses every RLS policy including the ones keeping
 * purchase cost and staff pay away from the wrong eyes. That rule is
 * not relaxed here so much as narrowly excepted: the message dispatcher
 * runs from a cron with no user session at all, so there is no session
 * to act as.
 *
 * The exception is kept small on purpose. Exactly three callers, and
 * each earns it:
 *   - /api/comms/dispatch — a cron with no session at all.
 *   - lib/comms/poke.ts — drains the outbox in-process after an action;
 *     needs to read comms_settings, which is owner-only, even when the
 *     person who triggered it is a manager.
 *   - features/staff/login-actions.ts — creating an auth user needs the
 *     admin API. It checks is_owner() against the CALLER'S OWN session
 *     before touching this client.
 *   - The route is behind CRON_SECRET.
 *   - service_role has EXECUTE on exactly four functions
 *     (claim_outbox, mark_message_sent, mark_message_failed,
 *     queue_scheduled_events) and no direct table grants, so even this
 *     client cannot read items, costs or customers.
 *
 * If you find yourself importing this anywhere else, the answer is
 * almost certainly a SECURITY DEFINER function instead.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set for the message dispatcher.",
    );
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
