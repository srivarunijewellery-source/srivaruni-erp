import type { SupabaseClient } from "@supabase/supabase-js";
import { send, type OutgoingMessage, type SenderConfig } from "./senders";

/**
 * The actual work of draining the outbox: claim a batch, send each
 * message, record the result. Lives here as a plain function -- not
 * behind an HTTP route -- so anything already running inside this app
 * (a server action, the dispatch route) can call it directly with a
 * service-role client, in-process.
 *
 * This used to only be reachable by POSTing to /api/comms/dispatch,
 * which meant even our OWN server actions authenticated to our OWN
 * running process with CRON_SECRET over a network hop -- a real
 * external caller's requirement (Vercel Cron) applied to a call that
 * was never external. That HTTP round-trip added nothing but a
 * dependency on an env var reaching every serverless instance, which
 * is exactly what broke: adding the secret in the dashboard doesn't
 * apply until the next deploy, so the in-process poke failed silently
 * with no network request ever leaving the function.
 *
 * CRON_SECRET still guards the ONE caller that is genuinely external:
 * Vercel Cron hitting the route over the public internet with no
 * session of its own. See route.ts.
 */
export interface DrainResult {
  claimed: number;
  sent: number;
  failed: number;
}

export async function drainOutbox(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  maxBatches: number,
): Promise<DrainResult> {
  let totalClaimed = 0;
  let totalSent = 0;
  let totalFailed = 0;
  let cfg: SenderConfig | null = null;

  for (let batch = 0; batch < maxBatches; batch++) {
    const { data: claimed, error: claimError } = await supabase.rpc("claim_outbox", {
      p_limit: 25,
    });
    if (claimError) throw new Error(claimError.message);

    const messages = (claimed ?? []) as Array<Record<string, unknown>>;
    if (messages.length === 0) break; // empty, or sending is paused.

    if (!cfg) {
      const { data: cfgRow, error: cfgError } = await supabase
        .from("comms_settings")
        .select(`email_provider, from_email, from_name, reply_to, resend_api_key,
                 whatsapp_provider, whatsapp_api_url, whatsapp_api_key, whatsapp_from,
                 wa_phone_number_id, wa_business_account_id, wa_access_token,
                 wa_api_version`)
        .maybeSingle();

      if (cfgError || !cfgRow) {
        throw new Error(cfgError?.message ?? "No communication settings found.");
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
        waPhoneNumberId: cfgRow.wa_phone_number_id,
        waBusinessAccountId: cfgRow.wa_business_account_id,
        waAccessToken: cfgRow.wa_access_token,
        waApiVersion: cfgRow.wa_api_version,
      };
    }

    totalClaimed += messages.length;

    for (const row of messages) {
      const msg: OutgoingMessage = {
        id: String(row.id),
        channel: row.channel as OutgoingMessage["channel"],
        toEmail: (row.to_email as string) ?? null,
        toPhone: (row.to_phone as string) ?? null,
        toName: (row.to_name as string) ?? null,
        subject: (row.subject as string) ?? null,
        body: String(row.body ?? ""),
        audience: (row.audience as "internal" | "customer") ?? "internal",
        templateName: (row.template_name as string) ?? null,
        templateLang: (row.template_lang as string) ?? null,
        templateVars: (row.template_vars as string[]) ?? null,
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

    if (messages.length < 25) break; // short batch -- the outbox is drained.
  }

  return { claimed: totalClaimed, sent: totalSent, failed: totalFailed };
}
