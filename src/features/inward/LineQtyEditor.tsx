"use client";

import { useState, useTransition } from "react";
import { updateInwardLineQty } from "./actions";
import { correctApprovedLineQty } from "./qtyCorrectionActions";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/cn";

/**
 * Inline quantity edit on the document itself.
 *
 * Saves on blur or Enter rather than behind a Save button: staff are
 * correcting a miscount while holding the piece, and an extra click per
 * line across a 40-line carton is the difference between using the
 * system and writing it on paper.
 *
 * On an APPROVED document the plain edit is refused, because the pieces
 * are already in stock and in the books. That refusal used to arrive as
 * two lines of small red text under a field that had silently snapped
 * back to its old value, which reads as a broken input rather than a
 * rule. Now the refusal opens the way through instead: give a reason,
 * and the stock is adjusted in the same breath as the line.
 */
export function LineQtyEditor({
  lineId,
  inwardId,
  qty,
  editable,
}: {
  lineId: string;
  inwardId: string;
  qty: number;
  editable: boolean;
}) {
  const [value, setValue] = useState(String(qty));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  /** Set when the document is approved: holds the quantity being asked
   *  for while a reason is collected. */
  const [needsReason, setNeedsReason] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState<string | null>(null);

  if (!editable) return <span className="tnum">{qty}</span>;

  const commit = () => {
    const next = Number(value);
    if (!Number.isInteger(next) || next < 1) {
      setValue(String(qty));
      setError(null);
      return;
    }
    if (next === qty) return;

    start(async () => {
      setError(null);
      setOutcome(null);
      const fd = new FormData();
      fd.set("lineId", lineId);
      fd.set("inwardId", inwardId);
      fd.set("qty", String(next));
      const result = await updateInwardLineQty(fd);
      if (result.ok) return;

      // The document is approved. Rather than reporting a dead end, ask
      // for the one thing needed to do it properly.
      if (/approved/i.test(result.error)) {
        setNeedsReason(next);
        return;
      }
      setError(result.error);
      setValue(String(qty));
    });
  };

  function confirmCorrection() {
    const next = needsReason;
    if (next === null) return;
    start(async () => {
      setError(null);
      const r = await correctApprovedLineQty(lineId, inwardId, next, reason);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setNeedsReason(null);
      setReason("");
      // The payable is the half people do not expect to move, so it is
      // said out loud rather than left to be discovered on the vendor
      // statement.
      setOutcome(
        r.data
          ? `${r.data.barcode} ${r.data.was} → ${r.data.now}. Stock ${r.data.stockBefore} → ${r.data.stockAfter}. Owed to the vendor ${formatPaise(r.data.payableBefore)} → ${formatPaise(r.data.payableAfter)}, posted today.`
          : "Nothing changed.",
      );
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <input
        type="number"
        min={1}
        inputMode="numeric"
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setValue(String(qty));
            setNeedsReason(null);
          }
        }}
        aria-label="Quantity received"
        className={cn(
          "tnum w-16 rounded-control border border-border bg-surface px-2 py-1 text-right text-sm",
          "focus:border-brand focus:outline-none disabled:opacity-50",
          needsReason !== null && "border-status-pending-fg",
        )}
      />

      {needsReason !== null && (
        <span className="mt-1 flex w-64 flex-col gap-1 rounded-control border border-status-pending-fg/40 bg-status-pending-bg p-2 text-left">
          <span className="text-2xs text-status-pending-fg">
            This document is approved, so {qty} {qty === 1 ? "piece is" : "pieces are"}{" "}
            already in stock and on the vendor&apos;s bill. Changing it to{" "}
            {needsReason} adjusts the stock by {needsReason - qty > 0 ? "+" : ""}
            {needsReason - qty} and posts the difference to what you owe, dated
            today.
          </span>
          <textarea
            autoFocus
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Invoice has no 2.6 line for this code; entered in error."
            className="w-full rounded-control border border-border bg-surface px-2 py-1 text-2xs"
          />
          <span className="flex gap-2">
            <button
              type="button"
              disabled={pending || reason.trim().length === 0}
              onClick={confirmCorrection}
              className="rounded-control bg-brand px-2 py-1 text-2xs text-brand-fg disabled:opacity-50"
            >
              {pending ? "Correcting…" : "Correct quantity and stock"}
            </button>
            <button
              type="button"
              onClick={() => {
                setNeedsReason(null);
                setReason("");
                setValue(String(qty));
              }}
              className="text-2xs text-text-muted hover:underline"
            >
              Cancel
            </button>
          </span>
        </span>
      )}

      {outcome && (
        <span className="mt-0.5 w-64 text-left text-2xs text-status-done-fg">
          {outcome}
        </span>
      )}
      {error && (
        <span className="mt-0.5 w-64 text-left text-2xs text-status-danger-fg">
          {error}
        </span>
      )}
    </span>
  );
}
