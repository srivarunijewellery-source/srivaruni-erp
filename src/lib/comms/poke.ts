/**
 * Fires the outbox dispatcher immediately after an action that just
 * queued a comms event -- inward approved, transfer dispatched, a
 * payment recorded, and so on.
 *
 * Why this exists at all: the DB trigger that raises the event runs
 * inside Postgres, which has no route to the internet. It can write a
 * row into message_outbox -- that part is instant, always happens --
 * but something with real network access has to come along and
 * actually call Resend. This is that poke, fired right after the
 * mutation instead of waiting for the once-a-day cron.
 *
 * Two layers of safety, on purpose:
 *   1. The message is durable the moment the trigger fires, regardless
 *      of whether this poke succeeds. If this call fails outright --
 *      network blip reaching our own route -- nothing is lost; the row
 *      sits as 'queued' and the next successful poke, a manual Retry,
 *      or tomorrow's cron will still pick it up.
 *   2. If the poke reaches the dispatcher but the SEND itself fails
 *      (Resend down, bad key), that failure is already handled inside
 *      the route: mark_message_failed records it and schedules a
 *      backed-off retry in the database. This function does not need
 *      to reimplement that -- it only needs to try reaching the route.
 *
 * One quick retry on the poke itself (not the message) covers the
 * common case of a single transient blip without adding real latency
 * to the action that triggered it.
 */
export interface PokeResult {
  ok: boolean;
  claimed?: number;
  sent?: number;
  failed?: number;
  error?: string;
}

export async function pokeDispatch(): Promise<PokeResult> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, error: "CRON_SECRET is not set, so the sender cannot be triggered." };
  }

  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const attempt = async (): Promise<PokeResult> => {
    try {
      const res = await fetch(`${base}/api/comms/dispatch`, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as {
        claimed?: number;
        sent?: number;
        failed?: number;
        error?: string;
      };
      if (!res.ok) {
        return { ok: false, error: body.error ?? `Sender returned ${res.status}.` };
      }
      return { ok: true, claimed: body.claimed, sent: body.sent, failed: body.failed };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Could not reach the sender." };
    }
  };

  const first = await attempt();
  if (first.ok) return first;

  await new Promise((r) => setTimeout(r, 800));
  return attempt();
}

/**
 * Fire-and-log variant for the common case: an action just did its
 * real job (approved an inward, dispatched a transfer) and that must
 * never fail or slow down because an email had trouble. Awaited so it
 * still runs within this request on serverless, but its outcome is
 * deliberately not surfaced to the person as an error -- only logged,
 * since the queued message is already safe and will go out one way or
 * another.
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
