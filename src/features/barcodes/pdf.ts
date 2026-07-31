import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import bwipjs from "bwip-js";
import { DEFAULT_GAP_MM, MIN_GAP_MM, MAX_GAP_MM, type PrintAreaMm } from "./constants";

/**
 * The physical spec, confirmed against a photo of the actual roll stock:
 *
 *   - Full label:      100mm x 15mm, continuous roll, one label per row
 *   - Printable area:   65mm x 15mm, or 70mm x 15mm (chosen per print run)
 *   - The printable area folds at ITS OWN midpoint -- not the label's
 *     midpoint. The remainder (100 - printable) is a blank adhesive tail
 *     used to wrap around a string loop and seal to itself.
 *
 * Mechanically: thermal stock prints on the face and carries adhesive on
 * the back. Folding brings the two printed-face halves back-to-back
 * (adhesive-to-adhesive), sandwiching a string loop, while both original
 * front faces stay externally visible -- one per side, like a tiny closed
 * book. So: barcode on one half, item details on the other, and both
 * remain readable after folding, not hidden against each other.
 *
 * Known assumption, flagged for correction after a real test print: the
 * printable zone is LEFT-aligned within the 100mm label (printed head
 * first, blank tail feeds through after). If the real stock is tail-first,
 * flip PRINTABLE_ALIGN below -- everything else is unaffected.
 *
 * gapMm is the blank space between one label and the next along the feed
 * direction -- the physical gap visible between labels on the die-cut
 * roll, typically 2-3mm for this kind of stock. It is NOT part of the
 * 100mm label itself; it is extra page width appended after it, so each
 * PDF page represents one full pitch (label + trailing gap) rather than
 * just the label. Set it to 0 if the printer's own gap sensor already
 * handles spacing and the PDF should describe only the label.
 */
const MM = 2.834645669; // 1mm in PDF points
const LABEL_W_MM = 100;
const LABEL_H_MM = 15;
const PRINTABLE_ALIGN: "left" | "right" = "left";

export type { PrintAreaMm };

export interface LabelData {
  barcode: string;
  designCode: string | null;
  name: string;
  mrpPaise: number | null;
  qty: number;
}

function mm(v: number) {
  return v * MM;
}

async function barcodePng(value: string): Promise<{ bytes: Buffer; w: number; h: number }> {
  const bytes = await bwipjs.toBuffer({
    bcid: "code128",
    text: value,
    height: 8,
    includetext: false,
    scale: 4,
  });
  const w = bytes.readUInt32BE(16);
  const h = bytes.readUInt32BE(20);
  return { bytes, w, h };
}

function drawWrappedName(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  x: number,
  topY: number,
  maxWidth: number,
  maxLines: number,
): number {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const trial = current ? `${current} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      current = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  let y = topY;
  for (const line of lines.slice(0, maxLines)) {
    page.drawText(line, { x, y, size, font, color: rgb(0, 0, 0) });
    y -= size + 1.2;
  }
  return y;
}

/**
 * Builds the print-ready PDF: one label per page, with `qty` copies per
 * line item. Each page is sized to the label (100mm x 15mm) plus the
 * configured inter-label gap appended after it, so a page represents one
 * full pitch of the roll, not just the label.
 *
 * This is a first version validated against the stated dimensions, not
 * against a real print -- the one thing that can't be checked from here.
 * Test-print a single sheet before running a full batch, and the fold
 * alignment / panel split are the two things worth eyeballing first.
 */
export async function generateLabelsPdf(
  items: LabelData[],
  printAreaMm: PrintAreaMm,
  gapMm: number = DEFAULT_GAP_MM,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const printArea = mm(printAreaMm);
  const panelW = printArea / 2;
  const pad = mm(1.2);
  const labelW = mm(LABEL_W_MM); // the label itself -- all content positioning is relative to this
  const labelH = mm(LABEL_H_MM);
  const gap = mm(Math.max(MIN_GAP_MM, Math.min(MAX_GAP_MM, gapMm)));
  const pitchW = labelW + gap; // the page -- one full advance of the roll

  const printableX0 = PRINTABLE_ALIGN === "left" ? 0 : labelW - printArea;

  // One barcode image per distinct value, reused across repeated copies.
  const barcodeCache = new Map<string, { bytes: Buffer; w: number; h: number }>();
  for (const item of items) {
    if (!barcodeCache.has(item.barcode)) {
      barcodeCache.set(item.barcode, await barcodePng(item.barcode));
    }
  }

  for (const item of items) {
    const copies = Math.max(1, Math.floor(item.qty));
    const png = barcodeCache.get(item.barcode)!;
    const pngImage = await doc.embedPng(png.bytes);

    for (let i = 0; i < copies; i++) {
      const page = doc.addPage([pitchW, labelH]);

      // Boundary between the printable zone and the blank wrap-around tail.
      page.drawLine({
        start: { x: printableX0 + printArea, y: 0 },
        end: { x: printableX0 + printArea, y: labelH },
        thickness: 0.4,
        color: rgb(0.55, 0.55, 0.55),
      });

      // Fold line, at the printable zone's own midpoint.
      page.drawLine({
        start: { x: printableX0 + panelW, y: 0 },
        end: { x: printableX0 + panelW, y: labelH },
        thickness: 0.4,
        color: rgb(0.35, 0.35, 0.35),
        dashArray: [2, 2],
      });

      // --- Panel 1: barcode ------------------------------------------
      const barH = mm(7.5);
      const naturalW = (png.w / png.h) * barH;
      const maxW = panelW - 2 * pad;
      const barW = Math.min(naturalW, maxW);
      const barX = printableX0 + (panelW - barW) / 2;
      const barY = labelH - pad - barH;
      page.drawImage(pngImage, { x: barX, y: barY, width: barW, height: barH });

      const codeSize = 5.2;
      const codeW = fontRegular.widthOfTextAtSize(item.barcode, codeSize);
      page.drawText(item.barcode, {
        x: printableX0 + (panelW - codeW) / 2,
        y: pad,
        size: codeSize,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });

      // --- Panel 2: item details ---------------------------------------
      const px = printableX0 + panelW + pad;
      const pMaxW = panelW - 2 * pad;
      let ty = labelH - pad - mm(2.3);

      if (item.designCode) {
        page.drawText(item.designCode.slice(0, 22), {
          x: px,
          y: ty,
          size: 6.5,
          font: fontBold,
          color: rgb(0, 0, 0),
        });
      }
      ty -= mm(2.0);

      ty = drawWrappedName(page, item.name, fontRegular, 5, px, ty, pMaxW, 2);

      if (item.mrpPaise !== null) {
        const mrpText = `MRP Rs.${(item.mrpPaise / 100).toLocaleString("en-IN", {
          maximumFractionDigits: 0,
        })}`;
        page.drawText(mrpText, {
          x: px,
          y: pad,
          size: 5.4,
          font: fontBold,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  return doc.save();
}
