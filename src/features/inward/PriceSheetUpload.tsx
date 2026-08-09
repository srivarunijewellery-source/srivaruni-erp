"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, Label, FieldError } from "@/components/ui/Field";
import { formatPaise } from "@/lib/money";
import { applyPriceSheet, type SheetOutcome } from "./priceSheetActions";

interface Parsed {
  headers: string[];
  rows: Array<Record<string, unknown>>;
  sheetNames: string[];
}

/**
 * Price a whole inward from the vendor's own spreadsheet.
 *
 * One vendor sends a proper sheet — SKU, item name, landing price — and
 * the SKU is the same design code already sitting in the item names we
 * typed at the bench. So the document can be priced without anyone
 * retyping a figure, which is the difference between an hour of copying
 * and a click.
 *
 * Parsed in the browser rather than uploaded: the file never leaves the
 * machine, there is nothing to store or clean up, and the person can see
 * what was read before anything is written.
 */
export function PriceSheetUpload({
  inwardId,
  vendorPriceMode,
}: {
  inwardId: string;
  /** How this vendor's rates are read. Shown so the GST answer below is
   *  made with the relevant fact on screen. */
  vendorPriceMode?: "gst_exclusive" | "gst_inclusive" | "no_gst" | null;
}) {
  const router = useRouter();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [skuCol, setSkuCol] = useState("");
  const [priceCol, setPriceCol] = useState("");
  // Defaults to inclusive: the vendor who actually sends a sheet heads
  // that column "MRP", and an MRP includes tax.
  const [inclusive, setInclusive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SheetOutcome | null>(null);
  const [busy, start] = useTransition();

  async function read(file: File) {
    setError(null);
    setOutcome(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const first = wb.SheetNames[0];
      if (!first) {
        setError("That file has no sheets in it.");
        return;
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[first]!, {
        defval: null,
      });
      if (rows.length === 0) {
        setError("The first sheet is empty.");
        return;
      }
      const headers = Object.keys(rows[0] ?? {});
      setParsed({ headers, rows, sheetNames: wb.SheetNames });

      // Guessed, not assumed: the guess is shown in the dropdowns and can
      // be changed before anything is applied.
      setSkuCol(guess(headers, ["sku", "code", "design", "item code", "style"]) ?? "");
      setPriceCol(
        guess(headers, ["landing", "landed", "mrp", "price", "rate", "cost", "amount"]) ??
          "",
      );
    } catch {
      setError("That file could not be read. XLSX, XLS and CSV all work.");
    }
  }

  const preview = parsed && skuCol && priceCol
    ? parsed.rows
        .map((r) => ({
          sku: String(r[skuCol] ?? "").trim(),
          paise: toPaise(r[priceCol]),
        }))
        .filter((r) => r.sku && r.paise !== null)
    : [];

  return (
    <Card>
      <CardHeader className="font-medium">Price from the vendor&apos;s sheet</CardHeader>
      <CardBody className="space-y-3">
        <p className="text-2xs text-text-muted">
          The SKU column is matched against the design code in each item&apos;s
          name — <span className="font-mono">cz studs 2290060826</span> matches
          SKU <span className="font-mono">2290</span>. A prefix like{" "}
          <span className="font-mono">SV-2290</span> matches too.
        </p>

        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void read(f);
          }}
          className="block w-full text-sm file:mr-3 file:rounded-control file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-2xs"
        />

        {error && <FieldError>{error}</FieldError>}

        {parsed && (
          <>
            <div className="flex flex-wrap gap-3">
              <div>
                <Label htmlFor="sku-col">SKU column</Label>
                <Select
                  id="sku-col"
                  value={skuCol}
                  onChange={(e) => setSkuCol(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="price-col">Price column</Label>
                <Select
                  id="price-col"
                  value={priceCol}
                  onChange={(e) => setPriceCol(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-control border border-border p-2">
              <label className="flex items-center gap-1.5 text-2xs">
                <input
                  type="checkbox"
                  checked={inclusive}
                  onChange={(e) => setInclusive(e.target.checked)}
                />
                these prices include GST
              </label>
              {vendorPriceMode && (
                <span className="text-2xs text-text-muted">
                  · this vendor is set to{" "}
                  <span className="text-text-primary">
                    {vendorPriceMode.replace(/_/g, " ")}
                  </span>
                  {mismatch(inclusive, vendorPriceMode) &&
                    " — the figures will be converted to match"}
                </span>
              )}
            </div>

            <p className="text-2xs text-text-muted">
              {parsed.rows.length} rows in the file · {preview.length} usable
              {parsed.sheetNames.length > 1 &&
                ` · only the first sheet (${parsed.sheetNames[0]}) is read`}
            </p>

            {preview.length > 0 && (
              <ul className="max-h-32 overflow-auto rounded-control border border-border p-2 text-2xs">
                {preview.slice(0, 6).map((r, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="font-mono">{r.sku}</span>
                    <span className="tnum">{formatPaise(r.paise ?? 0)}</span>
                  </li>
                ))}
                {preview.length > 6 && (
                  <li className="pt-1 text-text-subtle">
                    …and {preview.length - 6} more
                  </li>
                )}
              </ul>
            )}

            <Button
              disabled={busy || preview.length === 0}
              onClick={() => {
                setError(null);
                start(async () => {
                  const r = await applyPriceSheet(
                    inwardId,
                    preview.map((p) => ({ sku: p.sku, paise: p.paise as number })),
                    inclusive,
                  );
                  if (r.ok) {
                    setOutcome(r.data);
                    router.refresh();
                  } else setError(r.error);
                });
              }}
            >
              {busy ? "Matching…" : `Apply ${preview.length} prices`}
            </Button>
          </>
        )}

        {outcome && (
          <div className="space-y-1 border-t border-border pt-2 text-2xs">
            <p>
              <span className="text-status-done-fg">{outcome.matched} priced</span> ·{" "}
              {outcome.unmatched} could not be matched
            </p>
            {/* The misses are the point. A price sheet that quietly
                covered half the carton is worse than one that covered
                none, because nobody would go looking. */}
            {outcome.lines.filter((l) => !l.matched).length > 0 && (
              <ul className="max-h-40 space-y-0.5 overflow-auto">
                {outcome.lines
                  .filter((l) => !l.matched)
                  .map((l) => (
                    <li key={l.lineId} className="text-text-muted">
                      <span className="text-text-primary">{l.itemName}</span> —{" "}
                      {l.reason}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** True when the sheet and the vendor disagree about tax, so the screen
 *  can say the figures are being converted rather than leave the person
 *  to work out whether they should be. */
function mismatch(
  inclusive: boolean,
  mode: "gst_exclusive" | "gst_inclusive" | "no_gst",
): boolean {
  if (mode === "no_gst") return false;
  return inclusive !== (mode === "gst_inclusive");
}

/** First header whose name contains one of these words. */
function guess(headers: string[], words: string[]): string | undefined {
  const lower = headers.map((h) => ({ h, l: h.toLowerCase() }));
  for (const w of words) {
    const hit = lower.find((x) => x.l.includes(w));
    if (hit) return hit.h;
  }
  return undefined;
}

/**
 * Rupees to paise, tolerating what spreadsheets actually contain.
 *
 * A price cell arrives as a number, or as "1,250.00", or as "₹1,250" —
 * all three are the same figure and all three should work. Anything that
 * is not a positive number is dropped rather than treated as zero: a
 * zero price would silently mark a line as costed at nothing.
 */
function toPaise(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n =
    typeof v === "number" ? v : Number(String(v).replace(/[₹,\s]/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
