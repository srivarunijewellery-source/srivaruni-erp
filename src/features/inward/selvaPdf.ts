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
  quotationNo: string | null;
  /** Totals the document states about itself, for reconciliation. */
  statedQty: number | null;
  statedTotalPaise: number | null;
  /** Line totals actually summed, so a silent mis-parse is visible. */
  readQty: number;
  readTotalPaise: number;
  /** Table rows the line pattern matched but the description did not. */
  unreadable: string[];
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
    const description = m[2];
    const qtyStr = m[5];
    const rateStr = m[6];
    const totalStr = m[7];
    if (!description || !qtyStr || !rateStr || !totalStr) continue;

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

  const qtyStated = /Total no of Quantity\s*:?\s*([\d,]+(?:\.\d+)?)/i.exec(text);
  const totStated = /Total Amount\s*:?\s*([\d,]+(?:\.\d+)?)/i.exec(text);
  const quote = /Quotation No\s*:?\s*(\S+)/i.exec(text);

  return {
    rows,
    quotationNo: quote?.[1] ?? null,
    statedQty: qtyStated?.[1] ? Number(qtyStated[1].replace(/,/g, "")) : null,
    statedTotalPaise: totStated?.[1] ? rupeesToPaise(totStated[1]) : null,
    readQty,
    readTotalPaise,
    unreadable,
  };
}
