import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { send, type OutgoingMessage, type SenderConfig } from "@/lib/comms/senders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Drains the message outbox.
 *
 * Runs from Vercel Cron on a schedule and is also poked directly after
 * a test send or a retry, so the operator sees a real result instead of
 * waiting for the next tick.
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
  // The daily job is a separate concern from draining, so it only runs
  // when the schedule asks for it. Its own dedupe keys make a double
  // call harmless.
  if (url.searchParams.get("scheduled") === "1") {
    const { error } = await supabase.rpc("queue_scheduled_events", {
      p_on: new Date().toISOString().slice(0, 10),
      p_force: false,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const { data: claimed, error: claimError } = await supabase.rpc("claim_outbox", {
    p_limit: 25,
  });
  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  const messages = (claimed ?? []) as Array<Record<string, unknown>>;
  if (messages.length === 0) {
    // Either nothing queued or sending is paused. Both are fine and
    // neither is an error.
    return NextResponse.json({ claimed: 0, sent: 0, failed: 0 });
  }

  // claim_outbox already proved sending is not paused, so reading the
  // credentials now is safe and costs one round trip for the batch.
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

  const cfg: SenderConfig = {
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

  let sent = 0;
  let failed = 0;

  // Sequential on purpose. Batches are small, providers rate-limit, and
  // a burst of parallel failures is harder to read in the outbox than a
  // clean sequence.
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
      sent += 1;
      await supabase.rpc("mark_message_sent", {
        p_id: msg.id,
        p_provider_id: result.providerId,
      });
    } else {
      failed += 1;
      await supabase.rpc("mark_message_failed", {
        p_id: msg.id,
        p_error: result.error,
        p_status: result.httpStatus ?? null,
      });
    }
  }

  return NextResponse.json({ claimed: messages.length, sent, failed });
}

export async function POST(request: Request) {
  return handle(request);
}

/** Vercel Cron issues GET. */
export async function GET(request: Request) {
  return handle(request);
}
