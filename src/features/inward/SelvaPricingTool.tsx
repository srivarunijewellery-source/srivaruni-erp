"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Field";
import { formatPaise } from "@/lib/money";
import { parseSelvaPdf, type SelvaParse } from "./selvaPdf";
import {
  applySelvaSheet, resolveSelvaLine,
  type SelvaMatch, type SelvaStatus,
} from "./selvaPricingActions";

/**
 * Selva Pricing Tool.
 *
 * Selva quote by PDF, not spreadsheet, so the existing sheet upload
 * could not touch them and 144 lines across two open inwards were
 * waiting to be typed in by hand.
 *
 * Three things this does that a plain importer does not, all for the
 * same reason -- a wrong vendor rate is invisible once it becomes a
 * landed cost, and by then it has already set a tag price:
 *
 *   1. Reconciles against the document's OWN stated totals, so a
 *      mis-parse shows up as a number that does not add up rather than
 *      as prices that look fine.
 *   2. Refuses to guess when one code carries several sizes, and shows
 *      the candidates instead.
 *   3. Reports both directions, so a quotation line that never became
 *      an item on the inward is as visible as an item with no price.
 */
export function SelvaPricingTool({
  inwardId,
  vendorName = "Selva",
}: {
  inwardId: string;
  vendorName?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<SelvaParse | null>(null);
  const [report, setReport] = useState<SelvaMatch[] | null>(null);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const lines = (report ?? []).filter((r) => r.kind === "line");
  const orphans = (report ?? []).filter((r) => r.kind === "sheet");
  /** Lines whose entered count does not match what the document bills. */
  const qtyOff = (report ?? []).filter(
    (r) => r.kind === "line" && (r.qtyStatus === "short" || r.qtyStatus === "over"),
  );
  const count = (s: SelvaStatus) => lines.filter((r) => r.status === s).length;

  // Did we read every line the document has? Checked against its own
  // S.NO column: they run 1..N, so a dropped row is a missing integer.
  //
  // This used to reconcile against the printed total instead, which
  // failed on every tax invoice. Labels and values sit in separate
  // blocks there, so "TOTAL AMOUNT :" is never followed by its figure --
  // the regex walked past the newline and grabbed a quantity, or the 3
  // out of "3%". Forty-one lines adding to exactly Rs30,100 were
  // refused because the code believed the document said Rs3.
  const reconciled = parsed?.integrity.ok ?? true;

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setReport(null);
    setApplied(false);
    setParsed(null);
    try {
      const p = await parseSelvaPdf(file);
      if (p.rows.length === 0) {
        setError("No priceable lines were found. Is this a Selva quotation PDF?");
        return;
      }
      setParsed(p);
      start(async () => {
        const r = await applySelvaSheet(inwardId, p.rows, true);
        if (r.ok) setReport(r.data);
        else setError(r.error);
      });
    } catch {
      setError("That PDF could not be read.");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Selva pricing tool</p>
          <p className="text-2xs text-text-muted">
            Upload the quotation PDF and price the document from it. Prices are
            read GST-inclusive, as {vendorName} quote them.
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? "Reading…" : "Choose PDF"}
        </Button>
      </CardHeader>

      {(error || parsed) && (
        <CardBody className="space-y-3">
          {error && <FieldError>{error}</FieldError>}

          {parsed && (
            <div className="rounded-control border border-border px-3 py-2 text-2xs">
              <p className="text-text-primary">
                {parsed.docNo ? `${parsed.docNo} · ` : ""}
                {parsed.rows.length} of {parsed.integrity.highestSerial} lines read
                {reconciled && " ✓"}
              </p>
              <p className={reconciled ? "text-text-muted" : "text-status-danger-fg"}>
                {formatPaise(parsed.readTotalPaise)} across {parsed.readQty} pieces
                {/* Named, not counted. "3 lines missing" sends someone
                    through seventy rows looking for them; "lines 10, 32
                    missing" is two rows to look at. */}
                {parsed.integrity.missing.length > 0 &&
                  ` · line ${parsed.integrity.missing.join(", ")} could not be read`}
                {parsed.integrity.duplicated.length > 0 &&
                  ` · line ${parsed.integrity.duplicated.join(", ")} read twice`}
              </p>
              {parsed.unreadable.length > 0 && (
                <p className="mt-1 text-status-danger-fg">
                  {parsed.unreadable.length} line
                  {parsed.unreadable.length === 1 ? "" : "s"} had no readable
                  design code: {parsed.unreadable.slice(0, 3).join(" · ")}
                </p>
              )}
            </div>
          )}

          {report && (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs">
                <Tally label="will price" n={count("priced")} tone="good" />
                <Tally label="already correct" n={count("unchanged")} />
                <Tally label="need a decision" n={count("ambiguous")} tone="warn" />
                <Tally label="not on the quotation" n={count("not_in_sheet")} />
                <Tally label="no code in the title" n={count("no_code")} tone="warn" />
                <Tally label="quoted, never entered" n={orphans.length} tone="warn" />
                {/* The quantity verdict, line against line. Separate
                    from the pricing tallies because it is a different
                    question: those say whether we know the RATE, this
                    says whether the COUNT agrees with the bill. */}
                <Tally
                  label="quantity differs"
                  n={qtyOff.length}
                  tone={qtyOff.length > 0 ? "warn" : undefined}
                />
              </div>

              {qtyOff.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-2xs font-medium text-status-pending-fg">
                    Counts that do not match the document
                  </p>
                  <p className="text-2xs text-text-muted">
                    Priced either way — a wrong count does not make the rate
                    wrong. Correct the quantity on the line and the stock and
                    payable move with it.
                  </p>
                  <ul className="space-y-0.5">
                    {qtyOff.map((r) => (
                      <li key={r.lineId} className="text-2xs">
                        <span className="font-mono">{r.barcode}</span>{" "}
                        <span className="text-text-muted">{r.itemName}</span> —
                        entered{" "}
                        <span className="tnum text-text-primary">{r.lineQty}</span>,
                        document bills{" "}
                        <span className="tnum text-text-primary">{r.sheetQty}</span>{" "}
                        <span
                          className={
                            r.qtyStatus === "over"
                              ? "text-status-danger-fg"
                              : "text-status-pending-fg"
                          }
                        >
                          ({r.qtyStatus})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {count("ambiguous") > 0 && (
                <div className="space-y-2">
                  <p className="text-2xs text-text-muted">
                    One code, several sizes on the quotation, and nothing on the
                    item to tell them apart. Pick the right one — it prices the
                    line and records the size, so this line matches by itself
                    next time.
                  </p>
                  {lines
                    .filter((r) => r.status === "ambiguous")
                    .map((r) => (
                      <AmbiguousRow
                        key={r.lineId}
                        inwardId={inwardId}
                        row={r}
                        disabled={busy}
                        onDone={() => {
                          // Re-run against the SAME parsed file rather
                          // than clearing it. Wiping parsed + report sent
                          // the panel back to the empty file picker, so a
                          // resolve that had worked perfectly well looked
                          // like a click that did nothing but refresh.
                          if (!parsed) return;
                          start(async () => {
                            const r = await applySelvaSheet(
                              inwardId,
                              parsed.rows,
                              true,
                            );
                            if (r.ok) setReport(r.data);
                            else setError(r.error);
                          });
                          router.refresh();
                        }}
                      />
                    ))}
                </div>
              )}

              {orphans.length > 0 && (
                <details className="text-2xs">
                  <summary className="cursor-pointer text-text-muted">
                    {orphans.length} quotation line
                    {orphans.length === 1 ? "" : "s"} reached no item on this
                    inward
                  </summary>
                  <ul className="mt-1 space-y-0.5">
                    {orphans.map((o, i) => (
                      <li key={i} className="text-text-subtle">
                        <span className="font-mono">{o.code}</span>
                        {o.variant ? ` · ${o.variant}` : ""} ·{" "}
                        {formatPaise(o.ratePaise ?? 0)} — {o.itemName}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {!reconciled && (
                <FieldError>
                  {parsed?.integrity.highestSerial === 0
                    ? "No numbered rows were found, so this may not be a Selva document. Nothing will be written."
                    : `Some rows on this document were not read (${
                        parsed?.integrity.missing.join(", ") ?? ""
                      }). Pricing part of a shipment silently is worse than pricing none of it, so nothing will be written until that is sorted.`}
                </FieldError>
              )}

              {applied ? (
                <p className="text-2xs text-status-done-fg">
                  Priced. Costs recomputed for the whole document.
                </p>
              ) : (
                <Button
                  size="sm"
                  disabled={busy || !reconciled || count("priced") === 0}
                  onClick={() => {
                    setError(null);
                    start(async () => {
                      const r = await applySelvaSheet(inwardId, parsed!.rows, false);
                      if (!r.ok) {
                        setError(r.error);
                        return;
                      }
                      setReport(r.data);
                      setApplied(true);
                      router.refresh();
                    });
                  }}
                >
                  Price {count("priced")} line{count("priced") === 1 ? "" : "s"}
                </Button>
              )}
            </>
          )}
        </CardBody>
      )}
    </Card>
  );
}

function Tally({
  label,
  n,
  tone,
}: {
  label: string;
  n: number;
  tone?: "good" | "warn";
}) {
  if (n === 0) return null;
  const colour =
    tone === "good"
      ? "text-status-done-fg"
      : tone === "warn"
        ? "text-status-danger-fg"
        : "text-text-muted";
  return (
    <span className={colour}>
      <span className="tnum font-medium">{n}</span> {label}
    </span>
  );
}

function AmbiguousRow({
  inwardId,
  row,
  disabled,
  onDone,
}: {
  inwardId: string;
  row: SelvaMatch;
  disabled: boolean;
  onDone: () => void;
}) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  return (
    <div className="rounded-control border border-status-pending-fg/40 bg-status-pending-bg px-3 py-2">
      <p className="text-2xs">
        <span className="font-mono">{row.barcode}</span> · {row.itemName}
        {row.sizeText ? ` · size ${row.sizeText}` : " · no size recorded"}
      </p>
      <p className="text-2xs text-text-subtle">{row.note}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {(row.candidates ?? []).map((c, i) => (
          <Button
            key={i}
            size="sm"
            variant="secondary"
            disabled={busy || disabled}
            onClick={() => {
              setError(null);
              start(async () => {
                const r = await resolveSelvaLine(
                  inwardId,
                  row.lineId!,
                  c.paise,
                  // Only record a size where the item has none. Where it
                  // already carries one, the vendor's label is not
                  // grounds to overwrite what someone recorded off the
                  // physical piece.
                  row.sizeText ? null : c.variant,
                );
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                // The rate is written either way; this only fires when
                // the size could not be recorded alongside it, which is
                // worth saying because the line will ask again.
                if (r.data) setWarning(r.data);
                onDone();
              });
            }}
          >
            {c.variant ?? "no size"} — {formatPaise(c.paise)}
          </Button>
        ))}
      </div>
      {error && <FieldError>{error}</FieldError>}
      {warning && <p className="mt-1 text-2xs text-status-pending-fg">{warning}</p>}
    </div>
  );
}
