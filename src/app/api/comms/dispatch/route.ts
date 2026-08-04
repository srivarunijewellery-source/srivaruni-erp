import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { send, type OutgoingMessage, type SenderConfig } from "@/lib/comms/senders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Drains the message outbox.
 *
 * Sending happens once a day now, not every few minutes -- this is a
 * "good to have" feature, not a mandatory-reliability one, and a daily
 * pulse is enough for owner alerts and customer invoice copies without
 * needing an always-on heartbeat outside Vercel's Hobby-plan cron limit.
 *
 * Vercel Cron hits this once a day (`?scheduled=1`, see vercel.json).
 * That run does three things: queue the day's scheduled events
 * (birthdays, overdue transit), send the owner a one-line health pulse
 * via queue_comms_health_check, then fully drain the outbox in batches
 * -- since it is the only time sending happens, stopping after one
 * batch would leave a backlog on a busy day.
 *
 * The route is also poked directly (one batch, no daily extras) after
 * a manual test send or retry, so the operator sees a real result
 * instead of waiting for the next tick.
 *
 * Authorisation is a shared secret, not a user session, because there
 * is no user. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`
 * automatically, which is why the same header shape is used for the
 * manual pokes.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const supabase = createServiceClient();
  const url = new URL(request.url);
  const isDaily = url.searchParams.get("scheduled") === "1";

  if (isDaily) {
    const today = new Date().toISOString().slice(0, 10);

    const { error } = await supabase.rpc("queue_scheduled_events", {
      p_on: today,
      p_force: false,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Best-effort: a health-check failure should never stop sending.
    await supabase.rpc("queue_comms_health_check", { p_on: today });
  }

  // On the daily run, keep claiming and sending batches until the
  // outbox is empty (capped, so a misbehaving loop can't run forever).
  // On a manual poke, one batch is enough -- it exists to prove a
  // single test message went through, not to drain a day's backlog.
  const maxBatches = isDaily ? 20 : 1;
  let totalClaimed = 0;
  let totalSent = 0;
  let totalFailed = 0;
  let cfg: SenderConfig | null = null;

  for (let batch = 0; batch < maxBatches; batch++) {
    const { data: claimed, error: claimError } = await supabase.rpc("claim_outbox", {
      p_limit: 25,
    });
    if (claimError) {
      return NextResponse.json(
        { error: claimError.message, claimed: totalClaimed, sent: totalSent, failed: totalFailed },
        { status: 500 },
      );
    }

    const messages = (claimed ?? []) as Array<Record<string, unknown>>;
    if (messages.length === 0) break; // empty, or sending is paused -- either way, done.

    // Credentials only need reading once per run.
    if (!cfg) {
      const { data: cfgRow, error: cfgError } = await supabase
        .from("comms_settings")
        .select(`email_provider, from_email, from_name, reply_to, resend_api_key,
                 whatsapp_provider, whatsapp_api_url, whatsapp_api_key, whatsapp_from`)
        .maybeSingle();

      if (cfgError || !cfgRow) {
        return NextResponse.json(
          { error: cfgError?.message ?? "No communication settings found." },
          { status: 500 },
        );
      }

      cfg = {
        emailProvider: String(cfgRow.email_provider ?? "resend"),
        fromEmail: cfgRow.from_email,
        fromName: cfgRow.from_name,
        replyTo: cfgRow.reply_to,
        resendApiKey: cfgRow.resend_api_key,
        whatsappProvider: cfgRow.whatsapp_provider,
        whatsappApiUrl: cfgRow.whatsapp_api_url,
        whatsappApiKey: cfgRow.whatsapp_api_key,
        whatsappFrom: cfgRow.whatsapp_from,
      };
    }

    totalClaimed += messages.length;

    // Sequential on purpose. Providers rate-limit, and a burst of
    // parallel failures is harder to read in the outbox than a clean
    // sequence.
    for (const row of messages) {
      const msg: OutgoingMessage = {
        id: String(row.id),
        channel: row.channel as OutgoingMessage["channel"],
        toEmail: (row.to_email as string) ?? null,
        toPhone: (row.to_phone as string) ?? null,
        toName: (row.to_name as string) ?? null,
        subject: (row.subject as string) ?? null,
        body: String(row.body ?? ""),
      };

      const result = await send(msg, cfg);

      if (result.ok) {
        totalSent += 1;
        await supabase.rpc("mark_message_sent", {
          p_id: msg.id,
          p_provider_id: result.providerId,
        });
      } else {
        totalFailed += 1;
        await supabase.rpc("mark_message_failed", {
          p_id: msg.id,
          p_error: result.error,
          p_status: result.httpStatus ?? null,
        });
      }
    }

    // A short batch means the outbox is drained -- no point claiming again.
    if (messages.length < 25) break;
  }

  return NextResponse.json({ claimed: totalClaimed, sent: totalSent, failed: totalFailed });
}

export async function POST(request: Request) {
  return handle(request);
}

/** Vercel Cron issues GET. */
export async function GET(request: Request) {
  return handle(request);
}
