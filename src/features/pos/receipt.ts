/**
 * Thermal receipt.
 *
 * Printed by opening a plain HTML window and calling print, rather than
 * talking to the printer directly — a browser cannot open a USB device,
 * and every thermal printer worth using installs as a normal system
 * printer that accepts ordinary print jobs.
 *
 * The layout is monospace and sized in millimetres because thermal
 * paper is 80mm wide with roughly 72mm printable. Proportional fonts
 * make the amount column wander, which is the one thing on a receipt
 * that has to line up.
 */

export interface ReceiptLine {
  name: string;
  qty: number;
  unitPaise: number;
  totalPaise: number;
}

export interface ReceiptData {
  shopName: string;
  gstin: string | null;
  locationName: string;
  billNo: string;
  dateText: string;
  staffName: string;
  customerName: string | null;
  customerPhone: string | null;
  lines: ReceiptLine[];
  grossPaise: number;
  discountPaise: number;
  totalPaise: number;
  payments: Array<{ method: string; amount_paise: number; reference?: string }>;
}

const FRAME_ID = "sv-receipt-frame";

const rupees = (paise: number) => (paise / 100).toFixed(2);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Wraps a long item name so it never pushes the amount off the paper. */
function wrap(text: string, width = 22): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > width) {
      if (line) out.push(line.trim());
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) out.push(line);
  return out.length > 0 ? out : [text];
}

export function receiptHtml(d: ReceiptData): string {
  const rows = d.lines
    .map((l) => {
      const names = wrap(l.name);
      const first = names[0] ?? l.name;
      const rest = names.slice(1);
      return `
<tr>
  <td colspan="3" class="nm">${esc(first)}</td>
</tr>${rest.map((r) => `<tr><td colspan="3" class="nm">${esc(r)}</td></tr>`).join("")}
<tr>
  <td class="q">${l.qty} × ${rupees(l.unitPaise)}</td>
  <td></td>
  <td class="amt">${rupees(l.totalPaise)}</td>
</tr>`;
    })
    .join("");

  const pays = d.payments
    .map(
      (p) =>
        `<tr><td colspan="2">${esc(p.method.toUpperCase())}${
          p.reference ? ` ${esc(p.reference)}` : ""
        }</td><td class="amt">${rupees(p.amount_paise)}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<title>${esc(d.billNo)}</title>
<style>
  /* 80mm paper, ~72mm printable. Margins at zero because the printer
     driver adds its own and doubling them shrinks the text. */
  @page { size: 80mm auto; margin: 0; }
  body {
    width: 72mm; margin: 0 auto; padding: 3mm 0;
    font-family: "Courier New", Courier, monospace;
    font-size: 11px; line-height: 1.35; color: #000;
  }
  .c { text-align: center; }
  .b { font-weight: bold; }
  .big { font-size: 14px; }
  hr { border: none; border-top: 1px dashed #000; margin: 2mm 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 0; }
  .nm { word-break: break-word; }
  .q { font-size: 10px; }
  .amt { text-align: right; white-space: nowrap; }
  .tot td { font-size: 13px; font-weight: bold; padding-top: 1mm; }
</style></head>
<body>
  <div class="c b big">${esc(d.shopName)}</div>
  <div class="c">${esc(d.locationName)}</div>
  ${d.gstin ? `<div class="c">GSTIN ${esc(d.gstin)}</div>` : ""}
  <hr />
  <table>
    <tr><td>Bill</td><td></td><td class="amt">${esc(d.billNo)}</td></tr>
    <tr><td>Date</td><td></td><td class="amt">${esc(d.dateText)}</td></tr>
    <tr><td>Served by</td><td></td><td class="amt">${esc(d.staffName)}</td></tr>
    ${
      d.customerName || d.customerPhone
        ? `<tr><td>Customer</td><td></td><td class="amt">${esc(
            d.customerName ?? d.customerPhone ?? "",
          )}</td></tr>`
        : ""
    }
  </table>
  <hr />
  <table>${rows}</table>
  <hr />
  <table>
    <tr><td colspan="2">Subtotal</td><td class="amt">${rupees(d.grossPaise)}</td></tr>
    ${
      d.discountPaise > 0
        ? `<tr><td colspan="2">Discount</td><td class="amt">-${rupees(d.discountPaise)}</td></tr>`
        : ""
    }
    <tr class="tot"><td colspan="2">TOTAL</td><td class="amt">${rupees(d.totalPaise)}</td></tr>
  </table>
  <hr />
  <table>${pays}</table>
  <hr />
  <div class="c">Prices are inclusive of GST</div>
  <div class="c">Thank you, do visit again</div>
  <div class="c" style="margin-top:3mm">.</div>
</body></html>`;
}

export function printReceipt(d: ReceiptData): void {
  // A hidden iframe, not window.open.
  //
  // window.open is treated as a popup and gets blocked unless the click
  // is still on the stack -- and finalising a sale awaits a server
  // action first, so by print time the browser no longer counts it as
  // user-initiated. That is why printing worked sometimes and not
  // others. An iframe has no such restriction.
  const existing = document.getElementById(FRAME_ID);
  if (existing) existing.remove();

  const frame = document.createElement("iframe");
  frame.id = FRAME_ID;
  // Off-screen rather than display:none — a hidden iframe is not
  // guaranteed to lay out, and an unlaid-out document prints blank.
  frame.setAttribute(
    "style",
    "position:fixed;right:0;bottom:0;width:80mm;height:0;border:0;visibility:hidden;",
  );
  document.body.appendChild(frame);

  const doc = frame.contentWindow?.document;
  if (!doc) {
    console.error("[receipt] could not open a print frame");
    return;
  }

  doc.open();
  doc.write(receiptHtml(d));
  doc.close();

  const fire = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch (e) {
      console.error("[receipt] print failed", e);
    }
    // Left in the DOM briefly: removing it immediately can cancel the
    // job in some browsers before the dialog has taken the content.
    window.setTimeout(() => frame.remove(), 60_000);
  };

  // Wait for the frame document to settle, or the first receipt of a
  // session prints blank.
  if (frame.contentWindow?.document.readyState === "complete") {
    window.setTimeout(fire, 150);
  } else {
    frame.onload = () => window.setTimeout(fire, 150);
    window.setTimeout(fire, 800); // fallback if onload never fires
  }
}

/** Lets the counter re-print without ringing the sale again. */
export function reprintLast(d: ReceiptData | null): void {
  if (!d) return;
  printReceipt(d);
}
