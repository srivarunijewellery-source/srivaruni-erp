"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";
import {
  deleteTemplate,
  draftFromEventBody,
  editTemplate,
  fetchPhoneNumber,
  fetchTokenScopes,
  fetchTemplates,
  normalisePhone,
  sendTemplateMessage,
  submitTemplate,
  type MetaConfig,
} from "@/lib/comms/whatsapp";

/**
 * Reads the stored Meta credentials.
 *
 * RLS already restricts comms_settings to the owner, so a non-owner
 * gets no row and this returns an error rather than silently acting
 * with no credentials.
 */
async function loadConfig(): Promise<
  { ok: true; cfg: MetaConfig } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comms_settings")
    .select("wa_phone_number_id, wa_business_account_id, wa_access_token, wa_api_version")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "Could not read the WhatsApp settings." };
  }
  if (!data.wa_access_token || !data.wa_phone_number_id) {
    return {
      ok: false,
      error: "Add the phone number ID and access token first, then connect.",
    };
  }

  return {
    ok: true,
    cfg: {
      phoneNumberId: data.wa_phone_number_id,
      businessAccountId: data.wa_business_account_id ?? "",
      accessToken: data.wa_access_token,
      apiVersion: data.wa_api_version ?? "v21.0",
    },
  };
}

export async function saveWhatsappCredentials(formData: FormData): Promise<Result> {
  const supabase = await createClient();

  const token = String(formData.get("accessToken") ?? "").trim();

  const patch: Record<string, unknown> = {
    wa_phone_number_id: String(formData.get("phoneNumberId") ?? "").trim() || null,
    wa_business_account_id: String(formData.get("businessAccountId") ?? "").trim() || null,
    wa_api_version: String(formData.get("apiVersion") ?? "v21.0").trim() || "v21.0",
  };

  // Blank means "keep what is stored", so saving the form without
  // retyping a very long System User token does not wipe it.
  if (token) patch.wa_access_token = token;

  const { error } = await supabase.from("comms_settings").update(patch).eq("id", true);
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.whatsapp);
  return ok(undefined);
}

/**
 * Verifies the credentials actually work and records what Meta says the
 * number is. Answers "am I connected" with a real round trip rather
 * than "the fields are filled in".
 */
export async function testWhatsappConnection(): Promise<Result<string>> {
  const loaded = await loadConfig();
  if (!loaded.ok) return err(loaded.error);

  const res = await fetchPhoneNumber(loaded.cfg);
  if (!res.ok) return err(res.error ?? "Meta refused the connection.");

  const supabase = await createClient();
  await supabase
    .from("comms_settings")
    .update({
      wa_verified_name: res.data?.verified_name ?? null,
      wa_display_number: res.data?.display_phone_number ?? null,
      wa_quality_rating: res.data?.quality_rating ?? null,
      wa_last_synced_at: new Date().toISOString(),
    })
    .eq("id", true);

  // Reading the number proves the token exists, not that it can send.
  //
  // Those are two different Meta permissions, and the difference is the
  // whole of error #200: a management-only token reads the quality
  // rating, lists all 99 templates, reports a healthy green connection,
  // and is refused the moment it tries to message anyone. Saying
  // "Connected" on the strength of a read is the app telling a
  // comfortable lie.
  const perms = await fetchTokenScopes(loaded.cfg);
  const who = `${res.data?.verified_name ?? "this number"} (${
    res.data?.display_phone_number ?? "unknown number"
  })`;

  if (perms.ok && !perms.data?.canSend) {
    return err(
      `Connected as ${who}, but this token cannot send messages — it is missing ` +
        `whatsapp_business_messaging. In Meta Business Settings, open Users → ` +
        `System Users → your system user → Assign Assets → WhatsApp Accounts, ` +
        `give it Full control over the WhatsApp Business Account, then generate ` +
        `a NEW token with both whatsapp_business_management and ` +
        `whatsapp_business_messaging ticked. Changing the assignment does not ` +
        `upgrade a token that already exists.`,
    );
  }

  revalidatePath(ROUTES.whatsapp);
  return ok(
    `Connected as ${who}${
      perms.ok ? " · this token can send" : " · could not read the token's permissions"
    }.`,
  );
}

/** Mirrors the template list from Meta. */
export async function syncWhatsappTemplates(): Promise<Result<string>> {
  const loaded = await loadConfig();
  if (!loaded.ok) return err(loaded.error);
  if (!loaded.cfg.businessAccountId) {
    return err("Add the WhatsApp Business Account ID — templates live on it, not on the number.");
  }

  const res = await fetchTemplates(loaded.cfg);
  if (!res.ok) return err(res.error ?? "Could not read templates.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sync_whatsapp_templates", {
    p_rows: res.data ?? [],
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.whatsapp);
  const n = Number(data ?? 0);
  return ok(
    n === 0
      ? "Meta returned no templates. Nothing was removed here in case that is a token problem rather than an empty account."
      : `Synced ${n} template${n === 1 ? "" : "s"}.`,
  );
}

export async function mapEventTemplate(formData: FormData): Promise<Result> {
  const event = String(formData.get("event") ?? "");
  const templateId = String(formData.get("templateId") ?? "");
  const raw = String(formData.get("variables") ?? "").trim();

  const vars = raw
    ? raw.split(",").map((v) => v.trim()).filter(Boolean)
    : [];

  const supabase = await createClient();
  const { error } = await supabase.rpc("map_event_template", {
    p_event: event,
    p_template: templateId || null,
    p_vars: vars,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.whatsapp);
  return ok(undefined);
}

/**
 * Submits a new template for Meta's review.
 *
 * Approval is usually minutes to hours but is not guaranteed, and the
 * wording cannot be edited afterwards without resubmitting — so this
 * deliberately makes the person type the exact body rather than
 * generating one behind their back.
 */
export async function submitWhatsappTemplate(formData: FormData): Promise<Result<string>> {
  const loaded = await loadConfig();
  if (!loaded.ok) return err(loaded.error);
  if (!loaded.cfg.businessAccountId) {
    return err("Add the WhatsApp Business Account ID before submitting templates.");
  }

  const name = String(formData.get("name") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_");
  const body = String(formData.get("body") ?? "").trim();
  const examples = String(formData.get("examples") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!name) return err("Give the template a name.");
  if (!body) return err("The message body cannot be empty.");

  const slots = new Set(
    [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])),
  );
  if (slots.size !== examples.length) {
    return err(
      `The body has ${slots.size} placeholder(s) but ${examples.length} sample value(s). Meta will not review a template whose samples do not match.`,
    );
  }

  const res = await submitTemplate(loaded.cfg, {
    name,
    language: String(formData.get("language") ?? "en"),
    category: String(formData.get("category") ?? "UTILITY"),
    body,
    footer: String(formData.get("footer") ?? "").trim() || undefined,
    examples,
  });

  if (!res.ok) return err(res.error ?? "Meta refused the template.");

  await syncWhatsappTemplates();
  revalidatePath(ROUTES.whatsapp);
  return ok(`Submitted "${name}" for review. Meta usually decides within a few hours.`);
}

/**
 * Edits a template and sends it back for review.
 *
 * Meta refuses to edit a PENDING template, so this checks status first
 * and says why rather than surfacing a raw API error. For an APPROVED
 * template the OLD wording keeps sending until the edit is approved —
 * so nothing breaks while it is in review.
 */
export async function editWhatsappTemplate(formData: FormData): Promise<Result<string>> {
  const loaded = await loadConfig();
  if (!loaded.ok) return err(loaded.error);

  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const examples = String(formData.get("examples") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!id) return err("Missing template.");
  if (!body) return err("The message body cannot be empty.");

  const supabase = await createClient();
  const { data: tpl, error: tplError } = await supabase
    .from("whatsapp_templates")
    .select("meta_id, name, status")
    .eq("id", id)
    .maybeSingle();

  if (tplError || !tpl) return err("No such template.");
  if (!tpl.meta_id) return err("That template has not been synced from Meta yet.");

  if (tpl.status === "PENDING") {
    return err(
      "Meta does not allow editing a template while it is in review. Wait for the decision, or delete it and submit a new one.",
    );
  }

  const slots = new Set(
    [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])),
  );
  if (slots.size !== examples.length) {
    return err(
      `The body has ${slots.size} placeholder(s) but ${examples.length} sample value(s).`,
    );
  }

  const res = await editTemplate(loaded.cfg, tpl.meta_id, {
    body,
    footer: String(formData.get("footer") ?? "").trim() || undefined,
    examples,
    category: String(formData.get("category") ?? "") || undefined,
  });

  if (!res.ok) return err(res.error ?? "Meta refused the edit.");

  await syncWhatsappTemplates();
  revalidatePath(ROUTES.whatsapp);

  return ok(
    tpl.status === "APPROVED"
      ? `"${tpl.name}" is back in review. The current wording keeps sending until the edit is approved.`
      : `"${tpl.name}" resubmitted for review.`,
  );
}

/**
 * Deletes a template at Meta. The only way out of a PENDING template
 * submitted with a mistake, since those cannot be edited.
 */
export async function deleteWhatsappTemplate(id: string): Promise<Result<string>> {
  const loaded = await loadConfig();
  if (!loaded.ok) return err(loaded.error);
  if (!loaded.cfg.businessAccountId) {
    return err("Add the WhatsApp Business Account ID first.");
  }

  const supabase = await createClient();
  const { data: tpl } = await supabase
    .from("whatsapp_templates")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  if (!tpl?.name) return err("No such template.");

  const res = await deleteTemplate(loaded.cfg, tpl.name);
  if (!res.ok) return err(res.error ?? "Meta refused the deletion.");

  await syncWhatsappTemplates();
  revalidatePath(ROUTES.whatsapp);

  return ok(
    `Deleted "${tpl.name}". Meta blocks reusing that exact name for about 30 days, so give the replacement a slightly different one.`,
  );
}

/**
 * Drafts a template from an event's existing email wording.
 *
 * Rather than making someone invent a message and separately work out
 * which value fills which numbered slot, this converts our named
 * placeholders to Meta's positional ones and returns the mapping in the
 * right order, ready to submit.
 */
export async function draftTemplateForEvent(
  eventKey: string,
): Promise<Result<{ body: string; examples: string; variableMap: string[]; name: string }>> {
  const supabase = await createClient();

  const { data: event, error: eventError } = await supabase
    .from("comms_events")
    .select("key, label, variables")
    .eq("key", eventKey)
    .maybeSingle();

  if (eventError || !event) return err("No such event.");

  const { data: channel } = await supabase
    .from("comms_event_channels")
    .select("body_tpl")
    .eq("event_key", eventKey)
    .eq("channel", "whatsapp")
    .maybeSingle();

  const source = channel?.body_tpl ?? "";
  if (!source.trim()) return err("That event has no wording to start from.");

  const draft = draftFromEventBody(source, event.variables ?? []);

  return ok({
    body: draft.metaBody,
    examples: draft.examples.join(", "),
    variableMap: draft.variableMap,
    // Meta names allow lowercase, digits and underscores only.
    name: eventKey.replace(/[^a-z0-9]/g, "_"),
  });
}

export interface TestSendResult {
  ok: boolean;
  httpStatus: number | null;
  error: string | null;
  request: {
    to: string;
    templateName: string;
    language: string;
    variables: string[];
  };
  /** Meta's raw JSON body, exactly as returned — the whole point of this
   *  tool is to see the wire response, not a summary of it. */
  raw: unknown;
}

/**
 * Sends one template message directly to one number and hands back
 * exactly what Meta said.
 *
 * Deliberately bypasses the outbox and the event matrix entirely — this
 * answers "does this template, to this number, actually work", not
 * "does the queue work". Routing it through the normal machinery would
 * mean a misconfigured recipient rule looks identical to Meta rejecting
 * the template itself.
 */
export async function sendTestTemplate(
  templateId: string,
  toPhone: string,
  variables: string[],
): Promise<Result<TestSendResult>> {
  const loaded = await loadConfig();
  if (!loaded.ok) return err(loaded.error);

  const supabase = await createClient();
  const { data: tpl, error: tplError } = await supabase
    .from("whatsapp_templates")
    .select("name, language, status, variable_count")
    .eq("id", templateId)
    .maybeSingle();

  if (tplError || !tpl) return err("No such template.");
  if (tpl.status !== "APPROVED") {
    return err(`That template is ${tpl.status}, not approved — Meta will refuse it.`);
  }
  if (variables.length !== tpl.variable_count) {
    return err(
      `This template expects ${tpl.variable_count} value(s); ${variables.length} given.`,
    );
  }
  if (!toPhone.trim()) return err("Enter a phone number to send to.");

  const request = {
    to: normalisePhone(toPhone),
    templateName: tpl.name,
    language: tpl.language,
    variables,
  };

  const res = await sendTemplateMessage(loaded.cfg, request);

  return ok({
    ok: res.ok,
    httpStatus: res.httpStatus ?? null,
    error: res.ok ? null : (res.error ?? "Unknown error."),
    request,
    raw: res.raw,
  });
}
