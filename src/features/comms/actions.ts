"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";
import { pokeDispatch } from "@/lib/comms/poke";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;
const bool = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "");
  return v === "on" || v === "true";
};
const list = (fd: FormData, k: string) => {
  const raw = String(fd.get(k) ?? "").trim();
  if (!raw) return null;
  return raw.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean);
};

export async function saveCommsSettings(formData: FormData): Promise<Result> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("save_comms_settings", {
    p_email_enabled: bool(formData, "emailEnabled"),
    p_provider: str(formData, "provider") ?? "resend",
    p_from_email: str(formData, "fromEmail"),
    p_from_name: str(formData, "fromName"),
    p_reply_to: str(formData, "replyTo"),
    p_sending_domain: str(formData, "sendingDomain"),
    // Blank means "leave it alone", so saving the page without retyping
    // the key does not wipe it.
    p_resend_key: str(formData, "resendKey"),
    p_smtp_host: str(formData, "smtpHost"),
    p_smtp_port: Number(formData.get("smtpPort")) || null,
    p_smtp_user: str(formData, "smtpUser"),
    p_smtp_password: str(formData, "smtpPassword"),
    p_smtp_secure: bool(formData, "smtpSecure"),
    p_wa_enabled: bool(formData, "waEnabled"),
    p_wa_provider: str(formData, "waProvider"),
    p_wa_api_url: str(formData, "waApiUrl"),
    p_wa_api_key: str(formData, "waApiKey"),
    p_wa_from: str(formData, "waFrom"),
    p_test_recipient: str(formData, "testRecipient"),
    p_retry_max: Number(formData.get("retryMax")) || 3,
    p_daily_cap: Number(formData.get("dailyCap")) || 500,
    p_paused: bool(formData, "paused"),
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.commsSettings);
  return ok(undefined);
}

export async function saveEventChannel(formData: FormData): Promise<Result> {
  const event = String(formData.get("event") ?? "");
  const channel = String(formData.get("channel") ?? "");
  if (!event || !channel) return err("Missing event or channel.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_event_channel", {
    p_event: event,
    p_channel: channel,
    p_enabled: bool(formData, "enabled"),
    p_rule: str(formData, "rule"),
    p_emails: list(formData, "customEmails"),
    p_phones: list(formData, "customPhones"),
    p_subject: formData.has("subject") ? String(formData.get("subject") ?? "") : null,
    p_body: formData.has("body") ? String(formData.get("body") ?? "") : null,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.commsSettings);
  return ok(undefined);
}

/** Toggle only — used by the checkbox grid, which never touches templates. */
export async function toggleEventChannel(
  event: string,
  channel: string,
  enabled: boolean,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_event_channel", {
    p_event: event,
    p_channel: channel,
    p_enabled: enabled,
    p_rule: null,
    p_emails: null,
    p_phones: null,
    p_subject: null,
    p_body: null,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.commsSettings);
  return ok(undefined);
}

export async function sendTestMessage(formData: FormData): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("queue_test_message", {
    p_to: str(formData, "to"),
  });
  if (error) return err(toMessage(error));

  // Queuing is not sending. Kick the dispatcher so the test is a real
  // round trip to the provider rather than a row appearing in a table.
  const dispatched = await pokeDispatch();

  revalidatePath(ROUTES.comms);
  revalidatePath(ROUTES.commsSettings);

  if (!dispatched.ok) {
    return ok(
      `Test message queued (${String(data).slice(0, 8)}), but the sender did not run: ${dispatched.error}`,
    );
  }
  return ok("Test message sent. Check the outbox for the result.");
}

export async function retryMessage(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("retry_message", { p_id: id });
  if (error) return err(toMessage(error));
  await pokeDispatch();
  revalidatePath(ROUTES.comms);
  return ok(undefined);
}

export async function cancelMessage(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_message", { p_id: id });
  if (error) return err(toMessage(error));
  revalidatePath(ROUTES.comms);
  return ok(undefined);
}

export async function runScheduledEvents(): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("queue_scheduled_events", {
    p_on: new Date().toISOString().slice(0, 10),
    p_force: true,
  });
  if (error) return err(toMessage(error));

  const queuedCount = Number(data ?? 0);
  const dispatched = await pokeDispatch();
  revalidatePath(ROUTES.comms);

  if (!dispatched.ok) {
    return err(
      `Queued ${queuedCount} event(s), but sending failed: ${dispatched.error}. They are safe in the outbox -- try Retry, or they will go out with tomorrow's cron.`,
    );
  }

  return ok(
    `Queued ${queuedCount} event(s). Sent ${dispatched.sent ?? 0}` +
      (dispatched.failed ? `, ${dispatched.failed} failed (see the outbox for why).` : "."),
  );
}
