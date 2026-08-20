/**
 * Reads a Selva Gold Covering quotation PDF into priceable rows.
 *
 * Runs in the browser, like the XLSX price sheet reader alongside it:
 * the file never leaves the machine, and a vendor quotation is nobody
 * else's business.
 *
 * Their portal emits a rigid table, which is what makes this safe to
 * regex rather than guess at:
 *
 *   79   CHN1612482-19 CUTTING-30"-5B CHAIN   71179010  PCS  1  720  720.00
 *   ^    ^                                    ^         ^    ^  ^    ^
 *   sno  description                          hsn       unit qty rate total
 *
 * and the description itself carries the two things needed to price a
 * line -- the seven digit design code and the size:
 *
 *   CHN 1612482 - 19 CUTTING - 30" - 5B
 *       ^^^^^^^   ^^^^^^^^^^   ^^^   ^^
 *       code      variant note length finish
 *
 * The code alone is NOT a price. On the sample document thirteen codes
 * appear at two or three lengths, up to Rs210 apart, covering 32 of 79
 * lines. Length is what separates them, and code+length was verified
 * unique across every line -- so both go into each row and the matching
 * happens in the database against the item's own size attribute.
 */

export interface SelvaRow {
  code: string;
  /** Length or size as printed. Null when the line carries none. */
  variant: string | null;
  /** Rate per piece, in paise, exactly as printed -- GST inclusive. */
  paise: number;
  qty: number;
  desc: string;
}

export interface SelvaParse {
  rows: SelvaRow[];
  docNo: string | null;
  readQty: number;
  readTotalPaise: number;
  /** Table rows the line pattern matched but the description did not. */
  unreadable: string[];
  /**
   * Whether every line on the document was read.
   *
   * Checked against the document's own S.NO column, NOT against its
   * printed total. Reconciling to the total looked obvious and was
   * wrong: on an invoice the labels sit in one block and their values in
   * another, so `TOTAL AMOUNT :` is never followed by its own figure.
   * The regex walked past the newline and took the first number it
   * found -- a quantity, or the 3 out of "3%" -- then reported a
   * perfectly good parse as broken. Forty-one lines summing to exactly
   * Rs30,100 were refused because the code thought the document said
   * Rs3.
   *
   * Serial numbers cannot lie in that way. They start at 1 and run to N
   * with no gaps, so a missing row is a missing integer, and a repeated
   * row is a duplicate. It needs nothing from the layout, and works the
   * same on a quotation with no totals block at all.
   */
  integrity: {
    ok: boolean;
    /** Highest S.NO seen: how many lines the document claims to have. */
    highestSerial: number;
    /** Serial numbers between 1 and the highest that never appeared. */
    missing: number[];
    duplicated: number[];
  };
}

/** `79 CHN... 71179010 PCS 1 720 720.00` — anchored on the 8-digit HSN. */
const LINE =
  /^\s*(\d+)\s+(.+?)\s+(\d{8})\s+([A-Z]+)\s+([\d.]+)\s+([\d.]+)\s+([\d,]+\.\d{2})\s*$/;

/** `CHN1612482-19 CUTTING-30"-5B CHAIN` */
const DESC = /^([A-Z]{2,4})(\d{5,12})-(.*?)-(\d+(?:\.\d+)?)\s*"?-(\S+)/;

/** Fallback: a code with no size segment at all. */
const DESC_PLAIN = /^([A-Z]{2,4})(\d{5,12})\b/;

const rupeesToPaise = (s: string) => Math.round(Number(s.replace(/,/g, "")) * 100);

/**
 * Pulls the text layer out with pdf.js.
 *
 * Their portal prints a real text layer, so there is no OCR here and
 * none is wanted: OCR would turn a 6 into an 8 on a price column and
 * nobody would ever notice.
 */
async function readText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Bundled worker rather than a CDN URL: the shop tablet is on a phone
  // hotspot often enough that a network fetch mid-parse is a real
  // failure mode.
  //
  // new URL(..., import.meta.url) rather than a `?url` import suffix.
  // The suffix is Vite's; webpack and Turbopack do not understand it and
  // the import throws at runtime -- which reads as "that PDF could not
  // be read" and sends someone hunting through the regexes for a fault
  // that is not there.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();

    // Group items into visual lines by their y coordinate, then sort
    // each line left to right. Reading order in the raw stream is not
    // guaranteed to be either.
    const lines = new Map<number, Array<{ x: number; s: string }>>();
    for (const item of content.items as Array<{
      str: string;
      transform: number[];
    }>) {
      if (!item.str.trim()) continue;
      // transform[] is number | undefined under noUncheckedIndexedAccess.
      // Defaulting to 0 is right rather than merely quiet: a fragment with
      // no coordinate belongs at the origin, and it is a header artefact
      // that no line pattern will match anyway.
      const y = Math.round(item.transform[5] ?? 0);
      const bucket = lines.get(y) ?? [];
      bucket.push({ x: item.transform[4] ?? 0, s: item.str });
      lines.set(y, bucket);
    }

    const ordered = [...lines.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) =>
        parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(" ").replace(/\s+/g, " "),
      );
    pages.push(ordered.join("\n"));
  }

  return pages.join("\n");
}

export async function parseSelvaPdf(file: File): Promise<SelvaParse> {
  const text = await readText(file);

  const rows: SelvaRow[] = [];
  const unreadable: string[] = [];
  /** The S.NO of every grid row read, for the integrity check below. */
  const serials: number[] = [];
  let readQty = 0;
  let readTotalPaise = 0;

  for (const raw of text.split("\n")) {
    const m = LINE.exec(raw);
    if (!m) continue;

    // Every group is string | undefined to the compiler even though the
    // pattern cannot match without them. Rather than assert non-null, the
    // row is skipped if any are missing -- an assertion here would turn a
    // future pattern change into a NaN price instead of a dropped line,
    // and a NaN price is the one failure this whole tool exists to avoid.
    const serial = m[1];
    const description = m[2];
    const qtyStr = m[5];
    const rateStr = m[6];
    const totalStr = m[7];
    if (!serial || !description || !qtyStr || !rateStr || !totalStr) continue;

    serials.push(Number(serial));
    const desc = description.trim();

    readQty += Number(qtyStr);
    readTotalPaise += rupeesToPaise(totalStr);

    const d = DESC.exec(desc);
    if (d?.[2]) {
      rows.push({
        code: d[2],
        variant: d[4] ?? null,
        paise: rupeesToPaise(rateStr),
        qty: Number(qtyStr),
        desc,
      });
      continue;
    }

    const plain = DESC_PLAIN.exec(desc);
    if (plain?.[2]) {
      // A code with no size printed. Still priceable, as long as that
      // code carries only one price on the document -- which the
      // database checks, so it is not decided here.
      rows.push({
        code: plain[2],
        variant: null,
        paise: rupeesToPaise(rateStr),
        qty: Number(qtyStr),
        desc,
      });
      continue;
    }

    unreadable.push(desc);
  }

  // Quotation or tax invoice -- Selva's portal prints both, and the two
  // label their number differently.
  const doc =
    /Quotation No\s*:?\s*(\S+)/i.exec(text) ??
    /Invoice No\s*:?\s*(\S+)/i.exec(text);

  const highestSerial = serials.length > 0 ? Math.max(...serials) : 0;
  const seen = new Set(serials);
  const missing: number[] = [];
  for (let n = 1; n <= highestSerial; n++) if (!seen.has(n)) missing.push(n);

  const counts = new Map<number, number>();
  for (const n of serials) counts.set(n, (counts.get(n) ?? 0) + 1);
  const duplicated = [...counts.entries()].filter(([, c]) => c > 1).map(([n]) => n);

  return {
    rows,
    docNo: doc?.[1] ?? null,
    readQty,
    readTotalPaise,
    unreadable,
    integrity: {
      ok: highestSerial > 0 && missing.length === 0 && duplicated.length === 0,
      highestSerial,
      missing,
      duplicated,
    },
  };
}
