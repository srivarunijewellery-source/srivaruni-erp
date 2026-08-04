/**
 * The HTML shell every outgoing email is wrapped in.
 *
 * Written the way email actually has to be written, not the way a web
 * page is:
 *   - Tables for layout, not flexbox or grid. Outlook renders through
 *     Word's engine and simply drops modern CSS.
 *   - Inline styles on every element. Gmail strips <style> blocks in
 *     many contexts, so a stylesheet would silently vanish.
 *   - Hex colours written out literally rather than pulled from our
 *     design tokens. CSS custom properties do not resolve in most mail
 *     clients, and a token that fails to resolve renders as black text
 *     on a black background.
 *   - A max width around 600px, which is the width almost every desktop
 *     mail client gives you before it starts cutting content off.
 *
 * The palette below is copied from globals.css deliberately, not
 * imported. If the brand colours change, this file has to be updated by
 * hand -- an annoyance, but the alternative is mail that renders
 * unstyled for a large share of recipients.
 */

const BRAND = "#7c2d3a";
const INK = "#191512";
const MUTED = "#6b6259";
const LINE = "#e6e0d8";
const PAPER = "#faf7f2";
const CARD = "#ffffff";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Turns the plain-text body into HTML paragraphs.
 *
 * Templates are authored as plain text with blank lines between
 * paragraphs, and some -- the invoice copy especially -- contain
 * aligned item lines that only read correctly in a monospaced block.
 * A run of lines that looks like an itemised list is rendered as a
 * bordered block rather than as prose, so the invoice does not collapse
 * into a wall of text.
 */
function renderBody(body: string): string {
  const blocks = body.split(/\n{2,}/);

  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const looksTabular =
        lines.length > 1 && lines.filter((l) => /\s{2,}|×/.test(l)).length >= lines.length - 1;

      if (looksTabular) {
        return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px 0;background:${PAPER};border:1px solid ${LINE};border-radius:6px;">
  <tr><td style="padding:14px 16px;font-family:'SFMono-Regular',Consolas,monospace;font-size:13px;line-height:1.7;color:${INK};white-space:pre-wrap;">${escapeHtml(block)}</td></tr>
</table>`;
      }

      return `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:${INK};">${escapeHtml(
        block,
      ).replace(/\n/g, "<br />")}</p>`;
    })
    .join("\n");
}

export interface EmailShellOptions {
  subject: string;
  body: string;
  brandName?: string;
  /** Shown small under the heading — e.g. "Invoice BOD/26/00042". */
  preheader?: string;
  /** Internal alerts get a plainer treatment than customer mail. */
  audience?: "internal" | "customer";
}

export function renderEmailHtml({
  subject,
  body,
  brandName = "Sri Varuni Fashion Jewellery",
  preheader,
  audience = "internal",
}: EmailShellOptions): string {
  const isCustomer = audience === "customer";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<!-- Preheader: the grey preview line next to the subject in most
     inboxes. Hidden in the body itself, otherwise the first line of
     the message gets used and often reads badly. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(
    preheader ?? subject,
  )}</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAPER};">
<tr><td align="center" style="padding:28px 12px;">

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;background:${CARD};border:1px solid ${LINE};border-radius:10px;overflow:hidden;">

    <tr>
      <td style="background:${BRAND};padding:${isCustomer ? "24px 28px" : "18px 28px"};">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:${
          isCustomer ? "21px" : "17px"
        };letter-spacing:0.3px;color:#ffffff;">${escapeHtml(brandName)}</div>
        ${
          isCustomer
            ? `<div style="margin-top:4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#f0d9dd;letter-spacing:1.2px;text-transform:uppercase;">Imitation Jewellery</div>`
            : ""
        }
      </td>
    </tr>

    <tr>
      <td style="padding:28px;font-family:Arial,Helvetica,sans-serif;">
        <h1 style="margin:0 0 18px 0;font-size:18px;line-height:1.35;font-weight:600;color:${INK};">${escapeHtml(
          subject,
        )}</h1>
        ${renderBody(body)}
      </td>
    </tr>

    <tr>
      <td style="padding:16px 28px 22px 28px;border-top:1px solid ${LINE};font-family:Arial,Helvetica,sans-serif;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">
          ${
            isCustomer
              ? `Thank you for shopping with ${escapeHtml(brandName)}.`
              : `Sent automatically by Sri Varuni ERP. Reply to this address if something looks wrong.`
          }
        </p>
      </td>
    </tr>

  </table>

</td></tr>
</table>
</body>
</html>`;
}
