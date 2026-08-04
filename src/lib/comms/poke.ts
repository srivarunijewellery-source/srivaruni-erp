import { createServiceClient } from "@/lib/supabase/service";
import { drainOutbox } from "./drain";

/**
 * Fires the outbox drain immediately after an action that just queued a
 * comms event -- inward approved, transfer dispatched, a payment
 * recorded, and so on.
 *
 * This calls drainOutbox() directly, in-process, with no network hop
 * and no CRON_SECRET. There used to be an HTTP call from this function
 * to our own /api/comms/dispatch route, authenticated the same way
 * Vercel Cron authenticates from OUTSIDE the app. But this function
 * already runs inside the same Next.js server the route would have
 * handled the request on -- calling out to our own URL and back in was
 * pure overhead, and it meant the internal poke depended on
 * CRON_SECRET reaching every serverless instance, which only happens
 * on the next deploy after the env var is added in the dashboard. That
 * mismatch is exactly what caused test sends to silently do nothing
 * right after CRON_SECRET was first configured.
 *
 * CRON_SECRET still guards the ONE caller that is genuinely external:
 * Vercel Cron hitting /api/comms/dispatch over the public internet with
 * no session of its own. This function is not that caller.
 *
 * Two layers of safety still apply:
 *   1. The message is durable the moment the DB trigger fires,
 *      regardless of whether this call succeeds. If it throws -- a
 *      Supabase network blip -- nothing is lost; the row sits as
 *      'queued' and the next successful poke, a manual Retry, or
 *      tomorrow's cron will still pick it up.
 *   2. If a message reaches a real send attempt but the SEND itself
 *      fails (Resend down, bad key), that is already handled inside
 *      drainOutbox: mark_message_failed records it and schedules a
 *      backed-off retry in the database.
 */
export interface PokeResult {
  ok: boolean;
  claimed?: number;
  sent?: number;
  failed?: number;
  error?: string;
}

export async function pokeDispatch(): Promise<PokeResult> {
  try {
    const supabase = createServiceClient();
    const result = await drainOutbox(supabase, 1);
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Dispatch failed." };
  }
}

/**
 * Fire-and-log variant for the common case: an action just did its real
 * job and that must never fail or slow down because an email had
 * trouble. Awaited so it still completes within this request, but its
 * outcome is deliberately not surfaced to the person as an error --
 * only logged, since the queued message is already safe and will go
 * out one way or another.
 */
export async function pokeDispatchBestEffort(): Promise<void> {
  const result = await pokeDispatch();
  if (!result.ok) {
    console.error(`[comms] dispatch poke failed: ${result.error}`);
  } else if (result.failed && result.failed > 0) {
    console.error(
      `[comms] dispatch ran but ${result.failed} of ${result.claimed} message(s) failed to send -- see the outbox for details.`,
    );
  }
}
