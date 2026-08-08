import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Bank alert emails, in.
 *
 * Resend posts here when mail arrives at the receiving address. Two
 * things about their design shape this route:
 *
 * The webhook carries METADATA ONLY — no body — so the text has to be
 * fetched back with a second call. And Resend stores every inbound mail
 * regardless, so a failure here loses nothing: the message can be
 * replayed from their dashboard.
 *
 * Nothing is posted to the books. The message becomes an unreviewed row
 * and a person decides what it was.
 */

export const runtime = "nodejs";

/**
 * Svix signatures, verified by hand rather than pulling in the SDK.
 *
 * The signed payload is "id.timestamp.body" and the secret is base64
 * after its whsec_ prefix. Compared with timingSafeEqual because a
 * plain === on a signature leaks its contents a byte at a time.
 */
function verify(
  secret: string,
  id: string | null,
  timestamp: string | null,
  signature: string | null,
  body: string,
): boolean {
  if (!id || !timestamp || !signature) return false;

  // Reject anything older than five minutes: without this, a captured
  // request could be replayed forever.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");

  // The header can carry several space-separated versioned signatures.
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const a = Buffer.from(value);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  if (!secret) {
    // Loud in the log, quiet to the caller: an unconfigured endpoint
    // should not tell the internet what it is missing.
    console.error("inbound: RESEND_WEBHOOK_SECRET is not set");
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // Raw text, not parsed JSON — the signature is over the exact bytes.
  const raw = await request.text();

  if (
    !verify(
      secret,
      request.headers.get("svix-id"),
      request.headers.get("svix-timestamp"),
      request.headers.get("svix-signature"),
      raw,
    )
  ) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let event: { type?: string; data?: { email_id?: string; from?: string; subject?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  if (event.type !== "email.received" || !event.data?.email_id) {
    // Not ours, but a 200 so Resend stops retrying.
    return NextResponse.json({ ignored: true });
  }

  const emailId = event.data.email_id;
  const supabase = createServiceClient();

  /**
   * Environment first, database second.
   *
   * A secret stored in a table is also in every backup of that table.
   * Supabase keeps daily backups and point-in-time recovery, so a key in
   * comms_settings is sitting in restore points nobody thinks of as
   * secret stores — and anyone with SQL access can read it, which is a
   * much wider circle than anyone with Vercel access.
   *
   * The row stays as a fallback because it is editable in-app without a
   * redeploy, which matters when the person rotating the key is not a
   * developer. But if the environment has one, it wins.
   */
  let apiKey = process.env.RESEND_API_KEY ?? null;
  if (!apiKey) {
    const { data: cfg } = await supabase
      .from("comms_settings")
      .select("resend_api_key")
      .maybeSingle();
    apiKey = cfg?.resend_api_key ?? null;
  }
  if (!apiKey) {
    console.error("inbound: no Resend API key in comms_settings or the environment");
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // The body has to be fetched; the webhook only carries metadata.
  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    // A non-2xx here makes Resend retry, which is what we want — the
    // message is safe on their side either way.
    console.error("inbound: could not fetch email", emailId, res.status);
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }

  const mail = (await res.json()) as { text?: string; html?: string; subject?: string };
  const body =
    mail.text?.trim() ||
    // Fall back to stripping the HTML. Bank alerts are often HTML-only,
    // and tags between words would otherwise glue them together.
    (mail.html ?? "")
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();

  const { data, error } = await supabase.rpc("record_bank_alert", {
    p_email_id: emailId,
    p_from: event.data.from ?? null,
    p_subject: event.data.subject ?? mail.subject ?? null,
    p_body: body,
  });

  if (error) {
    console.error("inbound: record_bank_alert failed", error.message);
    return NextResponse.json({ error: "store failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, result: data });
}
