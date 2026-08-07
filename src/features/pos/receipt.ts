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
  hsn?: string | null;
}

export interface ReceiptData {
  shopName: string;
  gstin: string | null;
  locationName: string;
  branchAddress?: string | null;
  branchPhone?: string | null;
  billNo: string;
  dateText: string;
  /** Everyone credited on this invoice, already joined into one line.
   *  The cashier is deliberately not printed -- the customer has no use
   *  for who operated the till, only for who served them. */
  staffName: string;
  customerName: string | null;
  customerPhone: string | null;
  customerGstin?: string | null;
  lines: ReceiptLine[];
  grossPaise: number;
  discountPaise: number;
  /** Tax split, so the slip is a usable tax invoice rather than a till roll. */
  taxablePaise?: number;
  cgstPaise?: number;
  sgstPaise?: number;
  igstPaise?: number;
  totalPaise: number;
  payments: Array<{ method: string; amount_paise: number; reference?: string }>;
  terms?: string | null;
  footer?: string | null;
  upiId?: string | null;
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

/** Amount in words — Indian convention, because a tax invoice is
 *  expected to carry it and customers do check it. */
function inWords(paise: number): string {
  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight",
    "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
    "eighty", "ninety"];

  const two = (n: number): string =>
    n < 20 ? (ones[n] ?? "") : `${tens[Math.floor(n / 10)] ?? ""}${n % 10 ? " " + (ones[n % 10] ?? "") : ""}`;

  const rupees = Math.floor(paise / 100);
  if (rupees === 0) return "zero";

  const parts: string[] = [];
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const hundred = Math.floor((rupees % 1000) / 100);
  const rest = rupees % 100;

  if (crore) parts.push(`${two(crore)} crore`);
  if (lakh) parts.push(`${two(lakh)} lakh`);
  if (thousand) parts.push(`${two(thousand)} thousand`);
  if (hundred) parts.push(`${ones[hundred]} hundred`);
  if (rest) parts.push(two(rest));

  return parts.join(" ");
}

export function receiptHtml(d: ReceiptData): string {
  // Customers count what is in the bag against what is on the slip, so
  // the piece count is worth stating rather than leaving them to add up
  // the quantity column.
  const pieces = d.lines.reduce((n, l) => n + l.qty, 0);

  const hasSplit =
    (d.cgstPaise ?? 0) > 0 || (d.sgstPaise ?? 0) > 0 || (d.igstPaise ?? 0) > 0;

  const rows = d.lines
    .map((l, i) => {
      const names = wrap(l.name, 20);
      const first = names[0] ?? l.name;
      const rest = names.slice(1);
      return `
<tr>
  <td class="n item">${i + 1}</td>
  <td colspan="2" class="nm b item">${esc(first)}</td>
</tr>${rest.map((r) => `<tr><td></td><td colspan="2" class="nm">${esc(r)}</td></tr>`).join("")}
<tr class="lastrow">
  <td></td>
  <td class="q">${l.qty} &times; ${rupees(l.unitPaise)}</td>
  <td class="amt">${rupees(l.totalPaise)}</td>
</tr>`;
    })
    .join("");

  const pays = d.payments
    .map(
      (p) =>
        `<tr><td colspan="2">${esc(p.method.toUpperCase())}${
          p.reference ? ` <span class="q">${esc(p.reference)}</span>` : ""
        }</td><td class="amt">${rupees(p.amount_paise)}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<title>${esc(d.billNo)}</title>
<style>
  /* 80mm paper, ~72mm printable. Margins at zero because the printer
     driver adds its own and doubling them shrinks the text.

     Everything here has to survive a 1-bit thermal head: there are no
     greys, so a solid reversed block prints crisply while a light rule
     or a tint either prints black or vanishes. That is why the emphasis
     below is done with filled bands rather than shading. */
  @page { size: 80mm auto; margin: 0; }
  body {
    width: 72mm; margin: 0 auto; padding: 3mm 0;
    font-family: "Courier New", Courier, monospace;
    font-size: 11px; line-height: 1.35; color: #000;
    -webkit-font-smoothing: none;
  }
  .c { text-align: center; }
  .b { font-weight: bold; }
  .sm { font-size: 9.5px; }
  .xs { font-size: 8.5px; }

  /* Shop name reversed out of a solid band -- the one treatment that
     always renders cleanly and gives the slip an identity at a glance. */
  .band {
    background: #000; color: #fff;
    padding: 1.4mm 1mm; margin-bottom: 1.2mm;
    text-align: center; font-weight: bold;
    font-size: 15px; letter-spacing: 1px;
  }
  .kicker {
    text-align: center; font-size: 8.5px; letter-spacing: 2px;
    text-transform: uppercase; margin: 1mm 0 0.6mm;
  }

  hr { border: none; border-top: 1px dashed #000; margin: 1.6mm 0; }
  .solid { border-top: 1px solid #000; }

  table { width: 100%; border-collapse: collapse; }
  td, th { vertical-align: top; padding: 0; }
  th {
    font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.6px;
    text-align: left; font-weight: bold;
    border-bottom: 1px solid #000; padding-bottom: 0.6mm;
  }
  th.amt { text-align: right; }
  .n { width: 5mm; font-size: 9.5px; }
  .nm { word-break: break-word; }
  .q { font-size: 9.5px; }
  .amt { text-align: right; white-space: nowrap; }
  .item { padding-top: 1mm; }
  .lastrow td { padding-bottom: 1mm; border-bottom: 1px dotted #000; }

  /* The total, reversed out so it is the first thing the eye lands on. */
  .totalbox {
    background: #000; color: #fff;
    padding: 1.4mm 1.5mm; margin: 1.4mm 0 1mm;
    display: flex; justify-content: space-between; align-items: baseline;
    font-weight: bold;
  }
  .totalbox .lbl { font-size: 9.5px; letter-spacing: 1.2px; }
  .totalbox .val { font-size: 16px; }

  .saved {
    text-align: center; font-weight: bold; font-size: 10px;
    border: 1px dashed #000; padding: 1mm; margin: 1mm 0;
  }
  .totals { margin-top: 1.4mm; }
  .words { font-size: 9px; text-align: center; margin-bottom: 1mm; }
  .thanks {
    text-align: center; font-size: 11px; font-weight: bold;
    letter-spacing: 1px; margin-top: 1.5mm;
  }
</style></head>
<body>
  <div class="band">${esc(d.shopName)}</div>
  <div class="c sm">${esc(d.locationName)}</div>
  ${d.branchAddress ? `<div class="c sm">${esc(d.branchAddress)}</div>` : ""}
  ${d.branchPhone ? `<div class="c sm">Ph ${esc(d.branchPhone)}</div>` : ""}
  ${d.gstin ? `<div class="c xs">GSTIN ${esc(d.gstin)}</div>` : ""}
  <div class="kicker">Tax Invoice</div>
  <hr class="solid" />
  <table class="sm">
    <tr><td>Invoice</td><td class="amt b">${esc(d.billNo)}</td></tr>
    <tr><td>Date</td><td class="amt">${esc(d.dateText)}</td></tr>
    <tr><td>Salesman</td><td class="amt">${esc(d.staffName)}</td></tr>
    ${d.customerName ? `<tr><td>Customer</td><td class="amt">${esc(d.customerName)}</td></tr>` : ""}
    ${d.customerPhone ? `<tr><td>Phone</td><td class="amt">${esc(d.customerPhone)}</td></tr>` : ""}
    ${d.customerGstin ? `<tr><td>Cust GSTIN</td><td class="amt">${esc(d.customerGstin)}</td></tr>` : ""}
  </table>
  <hr />
  <table>
    <tr>
      <th class="n">#</th>
      <th>Item</th>
      <th class="amt">Amount</th>
    </tr>
    ${rows}
  </table>
  <table class="sm totals">
    <tr><td colspan="2">Subtotal (${pieces} item${pieces === 1 ? "" : "s"})</td><td class="amt">${rupees(d.grossPaise)}</td></tr>
    ${d.discountPaise > 0
      ? `<tr><td colspan="2">Discount</td><td class="amt">-${rupees(d.discountPaise)}</td></tr>` : ""}
    ${hasSplit ? `<tr><td colspan="2" class="q">Taxable value</td><td class="amt q">${rupees(d.taxablePaise ?? 0)}</td></tr>` : ""}
    ${(d.cgstPaise ?? 0) > 0 ? `<tr><td colspan="2" class="q">CGST</td><td class="amt q">${rupees(d.cgstPaise ?? 0)}</td></tr>` : ""}
    ${(d.sgstPaise ?? 0) > 0 ? `<tr><td colspan="2" class="q">SGST</td><td class="amt q">${rupees(d.sgstPaise ?? 0)}</td></tr>` : ""}
    ${(d.igstPaise ?? 0) > 0 ? `<tr><td colspan="2" class="q">IGST</td><td class="amt q">${rupees(d.igstPaise ?? 0)}</td></tr>` : ""}
  </table>

  <div class="totalbox">
    <span class="lbl">TOTAL</span>
    <span class="val">${rupees(d.totalPaise)}</span>
  </div>
  <div class="words">Rupees ${esc(inWords(d.totalPaise))} only</div>
  ${d.discountPaise > 0
    ? `<div class="saved">You saved ${rupees(d.discountPaise)} on this bill</div>` : ""}
  <hr />
  <table class="sm">${pays}</table>
  ${d.upiId ? `<hr /><div class="c sm">UPI ${esc(d.upiId)}</div>` : ""}
  <hr />
  ${d.terms ? `<div class="xs">${esc(d.terms)}</div><hr />` : ""}
  <div class="thanks">${esc(d.footer ?? "Thank you, do visit again")}</div>
  <div class="c xs">Prices are inclusive of GST</div>
  <div class="c xs">${esc(d.billNo)} &middot; ${esc(d.dateText)}</div>
  <!-- Trailing space so the tear-off does not cut the last line. -->
  <div class="c" style="margin-top:5mm">.</div>
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
