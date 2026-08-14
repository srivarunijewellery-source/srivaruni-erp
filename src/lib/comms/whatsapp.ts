/**
 * Meta WhatsApp Cloud API — direct, no BSP in between.
 *
 * The BSP layer (Interakt, AiSensy, Gupshup) sells a dashboard: template
 * builder, shared inbox, campaign tools. All of that already exists in
 * this app, so their monthly fee plus per-message markup buys a UI
 * nobody will open. Talking to Meta directly is roughly this file.
 *
 * The one thing that is NOT simpler direct: business-initiated messages
 * must use a template Meta has pre-approved, referenced by name with
 * positional variables. That rule comes from WhatsApp, not from the
 * BSP, so going direct does not avoid it.
 */

const GRAPH = "https://graph.facebook.com";

export interface MetaConfig {
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  apiVersion: string;
}

export interface MetaResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  /** Meta's own numeric code — worth surfacing, its messages are specific. */
  code?: number;
  /** The exact HTTP status Meta returned. */
  httpStatus?: number;
  /** The full parsed JSON body, success or failure — for anything that
   *  needs to show the actual wire response rather than a summary. */
  raw?: unknown;
}

async function call<T>(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<MetaResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    const payload = (await res.json().catch(() => null)) as
      | (T & { error?: { message?: string; code?: number; error_user_msg?: string } })
      | null;

    if (!res.ok || payload?.error) {
      return {
        ok: false,
        // error_user_msg is the human-readable one when present; it says
        // things like "template name does not exist" rather than a code.
        error:
          payload?.error?.error_user_msg ??
          payload?.error?.message ??
          `Meta returned ${res.status}.`,
        code: payload?.error?.code,
        httpStatus: res.status,
        raw: payload,
      };
    }

    return { ok: true, data: payload as T, httpStatus: res.status, raw: payload };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

export interface PhoneNumberInfo {
  verified_name?: string;
  display_phone_number?: string;
  quality_rating?: string;
  id?: string;
}

/** Confirms the token and phone number ID actually work together. */
export async function fetchPhoneNumber(cfg: MetaConfig): Promise<MetaResult<PhoneNumberInfo>> {
  return call<PhoneNumberInfo>(
    `${GRAPH}/${cfg.apiVersion}/${cfg.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating`,
    cfg.accessToken,
  );
}

/**
 * What the stored token is actually allowed to do.
 *
 * Reading a phone number needs only whatsapp_business_management, and
 * that is all "Test connection" ever exercised — so a token that could
 * list templates and read the quality rating reported a healthy green
 * connection and then failed every send with Meta error #200.
 *
 * debug_token names the granted scopes, which turns "you do not have the
 * necessary permissions" into "this token is missing
 * whatsapp_business_messaging" — a sentence someone can act on.
 */
export interface TokenScopes {
  scopes: string[];
  canRead: boolean;
  canSend: boolean;
  expiresAt: number | null;
}

export async function fetchTokenScopes(cfg: MetaConfig): Promise<MetaResult<TokenScopes>> {
  const res = await call<{
    data?: {
      scopes?: string[];
      granular_scopes?: Array<{ scope: string }>;
      expires_at?: number;
    };
  }>(
    // The token inspects itself: a System User token is its own app
    // token for this purpose, so no separate app secret is needed.
    `${GRAPH}/${cfg.apiVersion}/debug_token?input_token=${encodeURIComponent(cfg.accessToken)}`,
    cfg.accessToken,
  );
  // Narrowed by hand: the failure shape carries no data, and returning
  // `res` directly would claim it is a TokenScopes result.
  if (!res.ok) return { ok: false, error: res.error };

  const flat = new Set<string>([
    ...(res.data?.data?.scopes ?? []),
    ...(res.data?.data?.granular_scopes ?? []).map((g) => g.scope),
  ]);

  return {
    ok: true,
    data: {
      scopes: [...flat],
      canRead: flat.has("whatsapp_business_management"),
      canSend: flat.has("whatsapp_business_messaging"),
      // 0 means it never expires, which is what a System User token
      // normally is — worth showing rather than printing 1 Jan 1970.
      expiresAt: res.data?.data?.expires_at ? res.data.data.expires_at : null,
    },
  };
}

export interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components?: Array<{
    type: string;
    text?: string;
    format?: string;
  }>;
  rejected_reason?: string;
}

export interface NormalisedTemplate {
  meta_id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  body_text: string | null;
  header_text: string | null;
  footer_text: string | null;
  variable_count: number;
  rejection_reason: string | null;
}

/**
 * Counts {{1}}, {{2}}… in the approved body. Meta does not return the
 * count directly, and sending the wrong number of values is rejected,
 * so it is derived once here rather than guessed at mapping time.
 */
function countVariables(body: string | null): number {
  if (!body) return 0;
  const found = new Set<number>();
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) found.add(n);
  }
  return found.size === 0 ? 0 : Math.max(...found);
}

export function normaliseTemplate(t: MetaTemplate): NormalisedTemplate {
  const body = t.components?.find((c) => c.type === "BODY")?.text ?? null;
  const header = t.components?.find((c) => c.type === "HEADER")?.text ?? null;
  const footer = t.components?.find((c) => c.type === "FOOTER")?.text ?? null;

  return {
    meta_id: t.id,
    name: t.name,
    language: t.language,
    category: t.category ?? "UTILITY",
    status: t.status ?? "PENDING",
    body_text: body,
    header_text: header,
    footer_text: footer,
    variable_count: countVariables(body),
    rejection_reason: t.rejected_reason ?? null,
  };
}

export async function fetchTemplates(
  cfg: MetaConfig,
): Promise<MetaResult<NormalisedTemplate[]>> {
  const res = await call<{ data?: MetaTemplate[] }>(
    `${GRAPH}/${cfg.apiVersion}/${cfg.businessAccountId}/message_templates?limit=200`,
    cfg.accessToken,
  );

  if (!res.ok) return { ok: false, error: res.error, code: res.code };
  return { ok: true, data: (res.data?.data ?? []).map(normaliseTemplate) };
}

/** Submits a new template for review. Approval is usually minutes to hours. */
export async function submitTemplate(
  cfg: MetaConfig,
  input: {
    name: string;
    language: string;
    category: string;
    body: string;
    footer?: string;
    /** Meta requires a sample for every variable before it will review. */
    examples: string[];
  },
): Promise<MetaResult<{ id: string; status: string }>> {
  const components: Array<Record<string, unknown>> = [
    {
      type: "BODY",
      text: input.body,
      ...(input.examples.length > 0
        ? { example: { body_text: [input.examples] } }
        : {}),
    },
  ];

  if (input.footer) components.push({ type: "FOOTER", text: input.footer });

  return call(
    `${GRAPH}/${cfg.apiVersion}/${cfg.businessAccountId}/message_templates`,
    cfg.accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        language: input.language,
        category: input.category,
        components,
      }),
    },
  );
}

/**
 * Sends one template message.
 *
 * Numbers go in E.164 without the plus — Meta accepts "919876543210".
 * A number with spaces or a leading zero is silently treated as
 * undeliverable rather than erroring, so it is normalised here.
 */
export function normalisePhone(raw: string, defaultCountry = "91"): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return defaultCountry + digits;
  if (digits.startsWith("0") && digits.length === 11) {
    return defaultCountry + digits.slice(1);
  }
  return digits;
}

export async function sendTemplateMessage(
  cfg: MetaConfig,
  input: {
    to: string;
    templateName: string;
    language: string;
    variables: string[];
  },
): Promise<MetaResult<{ messages?: Array<{ id: string }> }>> {
  const components =
    input.variables.length > 0
      ? [
          {
            type: "body",
            parameters: input.variables.map((v) => ({ type: "text", text: v })),
          },
        ]
      : [];

  return call(
    `${GRAPH}/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`,
    cfg.accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalisePhone(input.to),
        type: "template",
        template: {
          name: input.templateName,
          language: { code: input.language },
          ...(components.length > 0 ? { components } : {}),
        },
      }),
    },
  );
}

/**
 * Edits an existing template.
 *
 * Meta's rule, not ours: a template can be edited when it is APPROVED,
 * REJECTED or PAUSED — never while PENDING. A pending template is
 * in review and can only be waited on or deleted. Editing an APPROVED
 * template sends it back into review, so the old wording keeps sending
 * until the new one is approved.
 *
 * The name and language cannot change; those identify the template.
 * Changing wording means editing this one, not creating another.
 */
export async function editTemplate(
  cfg: MetaConfig,
  metaTemplateId: string,
  input: {
    body: string;
    footer?: string;
    examples: string[];
    /** Meta allows re-categorising during an edit. */
    category?: string;
  },
): Promise<MetaResult<{ success?: boolean }>> {
  const components: Array<Record<string, unknown>> = [
    {
      type: "BODY",
      text: input.body,
      ...(input.examples.length > 0
        ? { example: { body_text: [input.examples] } }
        : {}),
    },
  ];

  if (input.footer) components.push({ type: "FOOTER", text: input.footer });

  return call(`${GRAPH}/${cfg.apiVersion}/${metaTemplateId}`, cfg.accessToken, {
    method: "POST",
    body: JSON.stringify({
      components,
      ...(input.category ? { category: input.category } : {}),
    }),
  });
}

/**
 * Deletes a template by name.
 *
 * The escape hatch for a PENDING template that was submitted with a
 * mistake: it cannot be edited, so it has to go and be resubmitted.
 *
 * Meta deletes ALL language versions sharing this name. It also blocks
 * reusing the same name for about 30 days afterwards, so recreating
 * usually means picking a slightly different name — the UI says so
 * rather than letting it fail on resubmit.
 */
export async function deleteTemplate(
  cfg: MetaConfig,
  name: string,
): Promise<MetaResult<{ success?: boolean }>> {
  return call(
    `${GRAPH}/${cfg.apiVersion}/${cfg.businessAccountId}/message_templates?name=${encodeURIComponent(name)}`,
    cfg.accessToken,
    { method: "DELETE" },
  );
}

/**
 * Builds a starting template body from one of our events.
 *
 * Our templates use named placeholders ({{customer}}); Meta uses
 * positional ones ({{1}}). This converts, and returns the ordered list
 * of our names so the event mapping is filled in automatically instead
 * of being retyped and getting the order wrong.
 */
export function draftFromEventBody(
  body: string,
  availableVars: string[],
): { metaBody: string; variableMap: string[]; examples: string[] } {
  const variableMap: string[] = [];
  let index = 0;

  const metaBody = body.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, name: string) => {
    if (!availableVars.includes(name)) return "";
    index += 1;
    variableMap.push(name);
    return `{{${index}}}`;
  });

  return {
    // Meta rejects bodies with newlines at the very start or doubled
    // blank lines, and trims trailing whitespace itself.
    metaBody: metaBody.replace(/\n{3,}/g, "\n\n").trim(),
    variableMap,
    examples: variableMap.map((v) => SAMPLE_VALUES[v] ?? v),
  };
}

/** Plausible samples so Meta's reviewer sees a realistic message. */
const SAMPLE_VALUES: Record<string, string> = {
  customer: "Priya Sharma",
  bill_no: "BOD/26/00042",
  total: "Rs. 2,450.00",
  date: "12 Aug 2026",
  location: "Boduppal",
  items: "Kundan necklace set x1",
  code: "SV-4821",
  value: "10% off",
  valid_to: "30 Sep 2026",
  doc_no: "IN/2608/0012",
  vendor: "Rajesh Traders",
  amount: "Rs. 18,500.00",
  offer: "Enjoy 10% off this month.",
};
