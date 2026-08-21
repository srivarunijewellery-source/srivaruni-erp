"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, Label, FieldError } from "@/components/ui/Field";
import { formatPaise } from "@/lib/money";
import { applyPriceSheet, type SheetOutcome } from "./priceSheetActions";
import { SelvaPricingTool } from "./SelvaPricingTool";

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
 *
 * The Selva tool is mounted underneath rather than folded into this one.
 * A spreadsheet arrives as named columns a person picks from; a Selva
 * quotation arrives as a fixed printed grid with its own totals to
 * reconcile against and its own sizes to settle. Sharing a card would
 * mean a column picker that vanishes for one vendor and a reconciliation
 * banner that never appears for the other.
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
  /** Optional. A sheet without a quantity column prices exactly as
   *  before; with one, every line's count is checked against the bill. */
  const [qtyCol, setQtyCol] = useState("");
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
      setQtyCol(guess(headers, ["qty", "quantity", "pcs", "pieces", "nos"]) ?? "");
    } catch {
      setError("That file could not be read. XLSX, XLS and CSV all work.");
    }
  }

  const preview = parsed && skuCol && priceCol
    ? parsed.rows
        .map((r) => ({
          sku: String(r[skuCol] ?? "").trim(),
          paise: toPaise(r[priceCol]),
          qty: qtyCol ? toQty(r[qtyCol]) : undefined,
        }))
        .filter((r) => r.sku && r.paise !== null)
    : [];

  return (
    <div className="space-y-3">
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
                  <Label htmlFor="qty-col">Quantity column</Label>
                  <Select
                    id="qty-col"
                    value={qtyCol}
                    onChange={(e) => setQtyCol(e.target.value)}
                  >
                    <option value="">Not on this sheet</option>
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
                      preview.map((p) => ({
                        sku: p.sku,
                        paise: p.paise as number,
                        qty: p.qty ?? undefined,
                      })),
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
                {outcome.qtyOff > 0 && (
                  <>
                    {" · "}
                    <span className="text-status-pending-fg">
                      {outcome.qtyOff} count{outcome.qtyOff === 1 ? "" : "s"} differ
                    </span>
                  </>
                )}
              </p>
              {/* Counts, listed separately from the pricing misses: this
                  says the RATE is right and the COUNT is not, which is a
                  different job for a different person. */}
              {outcome.lines.filter(
                (l) => l.qtyStatus === "short" || l.qtyStatus === "over",
              ).length > 0 && (
                <ul className="max-h-32 space-y-0.5 overflow-auto border-t border-border pt-1">
                  {outcome.lines
                    .filter((l) => l.qtyStatus === "short" || l.qtyStatus === "over")
                    .map((l) => (
                      <li key={l.lineId} className="text-text-muted">
                        <span className="text-text-primary">{l.itemName}</span> —
                        entered <span className="tnum">{l.lineQty}</span>, sheet says{" "}
                        <span className="tnum">{l.sheetQty}</span> ({l.qtyStatus})
                      </li>
                    ))}
                </ul>
              )}
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

      {/* Mounted here rather than in PricingPanel so the pricing screen
          itself needs no change. It shows its own card and stays quiet
          until a PDF is chosen, so it costs nothing on the vendors it
          does not apply to. */}
      <SelvaPricingTool inwardId={inwardId} />
    </div>
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
/** A count from a spreadsheet cell: a number, "4", or " 4 ". Anything
 *  that is not a whole positive number is treated as absent rather than
 *  as zero, because a blank cell is not a claim that nothing arrived. */
function toQty(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n);
}

function toPaise(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n =
    typeof v === "number" ? v : Number(String(v).replace(/[₹,\s]/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
