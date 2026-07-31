import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import bwipjs from "bwip-js";
import {
  LABEL_W_MM,
  LABEL_H_MM,
  clampGeometry,
  type LabelGeometry,
} from "./constants";
import { APP } from "@/config/app";

/**
 * Jewellery flag tag, 100mm x 15mm continuous roll, one label per row.
 *
 * The printable head folds back on itself around a string or a ring
 * shank, leaving a two-sided flag. Both original front faces stay
 * outward, so each panel is its own readable face:
 *
 *   left panel  -> shop name, barcode, item code   (the scan-me face)
 *   right panel -> item name, design code, MRP     (the customer face)
 *
 * The fold position is a MEASURED value, not printArea / 2. The first
 * real print run showed the stock is pre-scored at a fixed point that
 * does not coincide with the midpoint of the printable area, so the two
 * panels are not equal halves. generateCalibrationPdf below prints a
 * millimetre ruler for measuring both that score line and the true
 * printable width -- print it once, read the numbers off, enter them in
 * the UI. Guessing these is what produced the misalignment.
 */
const MM = 2.834645669; // 1mm in PDF points

function mm(v: number) {
  return v * MM;
}

export interface LabelData {
  barcode: string;
  designCode: string | null;
  name: string;
  mrpPaise: number | null;
  qty: number;
}

async function barcodePng(value: string): Promise<{ bytes: Buffer; w: number; h: number }> {
  const bytes = await bwipjs.toBuffer({
    bcid: "code128",
    text: value,
    height: 8,
    includetext: false,
    scale: 4,
  });
  return { bytes, w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
}

/** Wraps to at most maxLines, shrinking nothing -- overflow is truncated. */
function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
  maxLines: number,
): string[] {
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
  return lines.slice(0, maxLines);
}

function formatMrp(paise: number): string {
  return `Rs.${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export async function generateLabelsPdf(
  items: LabelData[],
  geometry: Partial<LabelGeometry> = {},
): Promise<Uint8Array> {
  const { printAreaMm, foldAtMm, gapMm } = clampGeometry(geometry);

  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const labelW = mm(LABEL_W_MM);
  const labelH = mm(LABEL_H_MM);
  const pitchW = labelW + mm(gapMm);
  const printArea = mm(printAreaMm);
  const foldX = mm(foldAtMm);
  const pad = mm(1.3);

  const leftW = foldX;
  const rightW = printArea - foldX;

  const cache = new Map<string, { bytes: Buffer; w: number; h: number }>();
  for (const item of items) {
    if (!cache.has(item.barcode)) cache.set(item.barcode, await barcodePng(item.barcode));
  }

  for (const item of items) {
    const png = cache.get(item.barcode)!;
    const image = await doc.embedPng(png.bytes);

    for (let copy = 0; copy < Math.max(1, Math.floor(item.qty)); copy++) {
      const page = doc.addPage([pitchW, labelH]);

      // Fold line. Dashed so it reads as "fold here", not as a border.
      page.drawLine({
        start: { x: foldX, y: 0 },
        end: { x: foldX, y: labelH },
        thickness: 0.4,
        color: rgb(0.45, 0.45, 0.45),
        dashArray: [1.5, 1.5],
      });

      // ---------- left panel: shop name, barcode, item code ----------
      const shopSize = 4.6;
      const shopName = APP.tagName.toUpperCase();
      const shopW = bold.widthOfTextAtSize(shopName, shopSize);
      page.drawText(shopName, {
        x: (leftW - shopW) / 2,
        y: labelH - pad - shopSize + 1,
        size: shopSize,
        font: bold,
        color: rgb(0, 0, 0),
      });

      // Hairline under the shop name: cheap way to make a thermal label
      // look deliberate rather than dumped, and it survives low DPI.
      page.drawLine({
        start: { x: (leftW - shopW) / 2, y: labelH - pad - shopSize - 1 },
        end: { x: (leftW + shopW) / 2, y: labelH - pad - shopSize - 1 },
        thickness: 0.4,
        color: rgb(0, 0, 0),
      });

      const codeSize = 5.4;
      const barTop = labelH - pad - shopSize - 3.5;
      const barBottom = pad + codeSize + 1.5;
      const barH = Math.max(mm(4), barTop - barBottom);
      const barMaxW = leftW - 2 * pad;
      const barW = Math.min((png.w / png.h) * barH, barMaxW);

      page.drawImage(image, {
        x: (leftW - barW) / 2,
        y: barBottom,
        width: barW,
        height: barH,
      });

      const codeW = bold.widthOfTextAtSize(item.barcode, codeSize);
      page.drawText(item.barcode, {
        x: (leftW - codeW) / 2,
        y: pad,
        size: codeSize,
        font: bold,
        color: rgb(0, 0, 0),
      });

      // ---------- right panel: item name, design code, MRP ----------
      const rx = foldX + pad;
      const rMaxW = rightW - 2 * pad;
      let ry = labelH - pad - 5;

      for (const line of wrap(item.name, bold, 5.6, rMaxW, 2)) {
        page.drawText(line, { x: rx, y: ry, size: 5.6, font: bold, color: rgb(0, 0, 0) });
        ry -= 6.2;
      }

      if (item.designCode) {
        ry -= 0.5;
        page.drawText(item.designCode.slice(0, 26), {
          x: rx,
          y: ry,
          size: 4.8,
          font: regular,
          color: rgb(0.25, 0.25, 0.25),
        });
      }

      if (item.mrpPaise !== null) {
        // MRP anchored to the bottom rather than flowing after the name,
        // so it lands in the same place on every tag regardless of how
        // long the item name runs. A price that moves around is a price
        // that gets misread at the counter.
        page.drawText("MRP", {
          x: rx,
          y: pad + 0.5,
          size: 4.6,
          font: regular,
          color: rgb(0.3, 0.3, 0.3),
        });
        const mrpLabelW = regular.widthOfTextAtSize("MRP", 4.6);
        page.drawText(formatMrp(item.mrpPaise), {
          x: rx + mrpLabelW + 2.5,
          y: pad,
          size: 7.2,
          font: bold,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  return doc.save();
}

/**
 * A one-off ruler, printed on the real stock, to replace guesswork.
 *
 * Print a single copy, then read off two numbers against the scale:
 *   1. where the stock's pre-scored fold line falls  -> Fold position
 *   2. where the printable area stops being crisp    -> Printable width
 *
 * Enter both in the print screen and every subsequent label matches the
 * physical stock. This exists because the alternative -- inferring
 * millimetres from a photograph -- is how the first run came out
 * misaligned.
 */
export async function generateCalibrationPdf(
  geometry: Partial<LabelGeometry> = {},
): Promise<Uint8Array> {
  const { printAreaMm, foldAtMm, gapMm } = clampGeometry(geometry);

  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const labelH = mm(LABEL_H_MM);
  const page = doc.addPage([mm(LABEL_W_MM) + mm(gapMm), labelH]);

  const baseY = labelH * 0.42;

  page.drawLine({
    start: { x: 0, y: baseY },
    end: { x: mm(LABEL_W_MM), y: baseY },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });

  for (let i = 0; i <= LABEL_W_MM; i++) {
    const x = mm(i);
    const major = i % 10 === 0;
    const mid = i % 5 === 0;
    page.drawLine({
      start: { x, y: baseY },
      end: { x, y: baseY + (major ? 6 : mid ? 3.5 : 2) },
      thickness: major ? 0.5 : 0.3,
      color: rgb(0, 0, 0),
    });
    if (major && i > 0) {
      const label = String(i);
      page.drawText(label, {
        x: x - regular.widthOfTextAtSize(label, 4.6) / 2,
        y: baseY + 7.5,
        size: 4.6,
        font: bold,
        color: rgb(0, 0, 0),
      });
    }
  }

  page.drawText("mm from left edge -- mark where the stock folds", {
    x: mm(1),
    y: baseY - 6,
    size: 4.4,
    font: regular,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Where the CURRENT settings think things are, so the difference
  // between assumption and reality is visible on one sheet.
  page.drawLine({
    start: { x: mm(foldAtMm), y: 0 },
    end: { x: mm(foldAtMm), y: labelH },
    thickness: 0.5,
    color: rgb(0.45, 0.45, 0.45),
    dashArray: [1.5, 1.5],
  });
  page.drawText(`fold ${foldAtMm}`, {
    x: mm(foldAtMm) + 1.5,
    y: labelH - 6,
    size: 4.2,
    font: regular,
    color: rgb(0.35, 0.35, 0.35),
  });

  page.drawLine({
    start: { x: mm(printAreaMm), y: 0 },
    end: { x: mm(printAreaMm), y: labelH },
    thickness: 0.5,
    color: rgb(0.55, 0.55, 0.55),
  });
  page.drawText(`edge ${printAreaMm}`, {
    x: Math.max(0, mm(printAreaMm) - 22),
    y: 1.5,
    size: 4.2,
    font: regular,
    color: rgb(0.35, 0.35, 0.35),
  });

  return doc.save();
}
