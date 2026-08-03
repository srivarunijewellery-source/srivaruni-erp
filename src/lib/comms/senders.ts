/**
 * Transport adapters.
 *
 * Everything above this file is channel-agnostic: the outbox, the event
 * matrix, the retry logic and the recipient rules are identical for
 * email and WhatsApp. This is the only place the two differ, which is
 * the whole point of the design — enabling WhatsApp is adding a case to
 * `send()`, not building a second messaging system.
 */

export interface OutgoingMessage {
  id: string;
  channel: "email" | "whatsapp" | "sms";
  toEmail: string | null;
  toPhone: string | null;
  toName: string | null;
  subject: string | null;
  body: string;
}

export interface SenderConfig {
  emailProvider: string;
  fromEmail: string | null;
  fromName: string | null;
  replyTo: string | null;
  resendApiKey: string | null;
  whatsappProvider: string | null;
  whatsappApiUrl: string | null;
  whatsappApiKey: string | null;
  whatsappFrom: string | null;
}

export type SendResult =
  | { ok: true; providerId: string | null }
  | { ok: false; error: string; httpStatus?: number };

export async function send(
  msg: OutgoingMessage,
  cfg: SenderConfig,
): Promise<SendResult> {
  switch (msg.channel) {
    case "email":
      return sendEmail(msg, cfg);
    case "whatsapp":
      return sendWhatsapp(msg, cfg);
    default:
      return { ok: false, error: `The ${msg.channel} channel is not built yet.` };
  }
}

/** Plain text becomes minimally styled HTML — no template engine, no CSS framework. */
function toHtml(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;line-height:1.6;color:#191512;white-space:pre-wrap">${escaped}</div>`;
}

async function sendEmail(msg: OutgoingMessage, cfg: SenderConfig): Promise<SendResult> {
  if (!msg.toEmail) return { ok: false, error: "No email address on this message." };
  if (!cfg.fromEmail) return { ok: false, error: "No from address is configured." };

  if (cfg.emailProvider === "resend") {
    if (!cfg.resendApiKey) {
      return { ok: false, error: "No Resend API key is configured." };
    }

    const from = cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail;

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${cfg.resendApiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [msg.toEmail],
          subject: msg.subject ?? "(no subject)",
          text: msg.body,
          html: toHtml(msg.body),
          ...(cfg.replyTo ? { reply_to: cfg.replyTo } : {}),
        }),
      });

      const payload = (await res.json().catch(() => null)) as
        | { id?: string; message?: string; name?: string }
        | null;

      if (!res.ok) {
        return {
          ok: false,
          // Resend's own wording is more useful than anything generic:
          // "domain is not verified" is the actual fix, stated plainly.
          error: payload?.message ?? `Resend returned ${res.status}.`,
          httpStatus: res.status,
        };
      }
      return { ok: true, providerId: payload?.id ?? null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Network error." };
    }
  }

  if (cfg.emailProvider === "smtp") {
    // SMTP needs a TCP client (nodemailer), which pulls a dependency and
    // does not run on the edge runtime. Resend covers the requirement
    // today; this returns an honest error rather than pretending.
    return {
      ok: false,
      error: "SMTP is configured but not implemented. Use Resend for now.",
    };
  }

  return { ok: false, error: `Unknown email provider "${cfg.emailProvider}".` };
}

async function sendWhatsapp(msg: OutgoingMessage, cfg: SenderConfig): Promise<SendResult> {
  if (!msg.toPhone) return { ok: false, error: "No phone number on this message." };
  if (!cfg.whatsappApiUrl || !cfg.whatsappApiKey) {
    return {
      ok: false,
      error:
        "WhatsApp is switched on but has no provider URL or key. Add them in comms settings.",
    };
  }

  // Generic BSP shape (Interakt, AiSensy, Gupshup all accept a variant
  // of this). Meta's Cloud API additionally requires a pre-approved
  // template name, which is why the settings page warns about approval
  // lead time. Left generic deliberately: the provider is not chosen
  // yet, and guessing one would be worse than one clear place to adapt.
  try {
    const res = await fetch(cfg.whatsappApiUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.whatsappApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: cfg.whatsappFrom,
        to: msg.toPhone,
        type: "text",
        text: { body: msg.body },
      }),
    });

    const payload = (await res.json().catch(() => null)) as
      | { id?: string; message_id?: string; error?: { message?: string } }
      | null;

    if (!res.ok) {
      return {
        ok: false,
        error: payload?.error?.message ?? `Provider returned ${res.status}.`,
        httpStatus: res.status,
      };
    }
    return { ok: true, providerId: payload?.id ?? payload?.message_id ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}
