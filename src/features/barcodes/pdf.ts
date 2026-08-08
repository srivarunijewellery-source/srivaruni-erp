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
 *   left panel  -> barcode, item code                  (the scan face)
 *   right panel -> brand band, item name, MRP          (the customer face)
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

/**
 * The quiet zone is part of the symbol, not decoration.
 *
 * Code 128 requires at least 10 blank modules either side of the bars.
 * A scanner uses that blank run to find where the symbol starts and
 * ends; without it, a reader that clips even slightly into the first bar
 * reads a short code or nothing at all. The old call rendered bars
 * edge-to-edge and left the margin to whatever the page layout happened
 * to give -- 1.3mm, under spec, and shrinking further whenever the
 * barcode was scaled to fit a narrow panel.
 *
 * paddingwidth is in modules, so baking it into the PNG means the quiet
 * zone scales with the bars and survives any later resize. At scale 4
 * that is 40px of white each side of a 404px symbol, which is exactly
 * the 10X the spec asks for.
 */
const QUIET_ZONE_MODULES = 10;

async function barcodePng(value: string): Promise<{ bytes: Buffer; w: number; h: number }> {
  const bytes = await bwipjs.toBuffer({
    bcid: "code128",
    text: value,
    height: 8,
    includetext: false,
    scale: 4,
    paddingwidth: QUIET_ZONE_MODULES,
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
  const { printAreaMm, foldAtMm, gapMm, uppercaseItems, boldNames } =
    clampGeometry(geometry);

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

      // ---------- left panel: barcode + item code (the scan face) ----------
      const codeSize = 6.2;
      const barTop = labelH - pad;
      const barBottom = pad + codeSize + 2;
      const barH = Math.max(mm(4.5), barTop - barBottom);
      // Extra clearance from the fold: the crease sits at the right edge
      // of this panel, and a fold running through the quiet zone ruins
      // the read as surely as trimming through it.
      const foldClearance = mm(1.2);
      const barMaxW = leftW - 2 * pad - foldClearance;
      const barW = Math.min((png.w / png.h) * barH, barMaxW);

      page.drawImage(image, {
        // Centred in the space left AFTER the fold clearance, so the
        // symbol drifts away from the crease rather than toward it.
        x: (leftW - foldClearance - barW) / 2,
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

      // ---------- right panel: brand band, item name, MRP ----------
      const rx = foldX + pad;
      const rMaxW = rightW - 2 * pad;

      // Solid band with the name reversed out of it. On a thermal printer
      // a filled block is the one thing that always renders cleanly at
      // this size -- far more legible than a hairline rule, and it gives
      // the tag an actual identity from across a counter.
      const bandH = mm(5.4);
      const bandY = labelH - bandH;
      page.drawRectangle({
        x: foldX,
        y: bandY,
        width: rightW,
        height: bandH,
        color: rgb(0, 0, 0),
      });

      // Two lines: the house name large enough to read across a counter,
      // the category small underneath it. Both auto-shrink to the panel,
      // so a narrower measured fold never clips the brand.
      const brandTop = APP.tagBrandLine1;
      const brandSub = APP.tagBrandLine2;

      let topSize = 7.4;
      while (bold.widthOfTextAtSize(brandTop, topSize) > rMaxW && topSize > 4) topSize -= 0.15;
      let subSize = 4.1;
      while (regular.widthOfTextAtSize(brandSub, subSize) > rMaxW && subSize > 2.8) subSize -= 0.1;

      const topW = bold.widthOfTextAtSize(brandTop, topSize);
      const subW = regular.widthOfTextAtSize(brandSub, subSize);
      const blockH = topSize + subSize + 0.6;
      const blockBottom = bandY + (bandH - blockH) / 2 + 0.6;

      page.drawText(brandSub, {
        x: foldX + (rightW - subW) / 2,
        y: blockBottom,
        size: subSize,
        font: regular,
        color: rgb(1, 1, 1),
      });
      page.drawText(brandTop, {
        x: foldX + (rightW - topW) / 2,
        y: blockBottom + subSize + 0.6,
        size: topSize,
        font: bold,
        color: rgb(1, 1, 1),
      });

      // MRP sits on the baseline first and the name fills what is left,
      // so the price lands in the same spot on every tag no matter how
      // long the name runs. A price that moves gets misread at a counter.
      const mrpNumSize = 8.4;
      const mrpTop = pad + mrpNumSize;

      if (item.mrpPaise !== null) {
        // Right-aligned against the panel edge so the digits line up
        // vertically across a strip of tags -- easier to scan down a rail
        // than a left-aligned price that starts at a different x each time.
        const mrpText = formatMrp(item.mrpPaise);
        const numW = bold.widthOfTextAtSize(mrpText, mrpNumSize);
        const labelSize = 4.4;
        const labelW = regular.widthOfTextAtSize("MRP", labelSize);
        const rightEdge = foldX + rightW - pad;

        page.drawText(mrpText, {
          x: rightEdge - numW,
          y: pad,
          size: mrpNumSize,
          font: bold,
          color: rgb(0, 0, 0),
        });
        page.drawText("MRP", {
          x: rightEdge - numW - labelW - 2,
          y: pad + 1,
          size: labelSize,
          font: regular,
          color: rgb(0.35, 0.35, 0.35),
        });
      }

      const nameTop = bandY - 1.5;
      const nameRoom = nameTop - mrpTop;
      const nameSize = 5.8;
      const maxNameLines = Math.max(1, Math.floor(nameRoom / (nameSize + 0.8)));

      let ny = nameTop - nameSize;
      // Cased here rather than in the data: how a name PRINTS is a
      // display choice, and the stored name has to stay as typed or
      // search stops matching what people search for.
      const printedName = uppercaseItems ? item.name.toUpperCase() : item.name;

      // Bold reads better across a counter but eats width, so a long
      // name wraps sooner. Measured with the SAME font it is drawn in,
      // or the wrap points come out wrong and text overruns the panel.
      const nameFont = boldNames ? bold : regular;

      for (const line of wrap(printedName, nameFont, nameSize, rMaxW, Math.min(2, maxNameLines))) {
        page.drawText(line, { x: rx, y: ny, size: nameSize, font: nameFont, color: rgb(0, 0, 0) });
        ny -= nameSize + 0.8;
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
