"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Field";
import { formatPaise } from "@/lib/money";
import { postBooksCorrection, type BooksGap } from "./booksActions";

/**
 * Says when the books no longer match the document, and offers to fix it.
 *
 * Renders nothing at all when they agree, which is almost always. A
 * banner that is always present is a banner nobody reads.
 *
 * The gap itself is invisible without this. Costs recompute whenever a
 * vendor changes or freight is added, but the journal that credited the
 * vendor was posted once, at approval, and never again -- so what you
 * owe drifts away from what the document says with nothing on any screen
 * to show it. This is the only place that difference surfaces.
 */
export function BooksGapBanner({
  inwardId,
  gap,
}: {
  inwardId: string;
  /** From getBooksGap on the server. Null when the books agree. */
  gap: BooksGap | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, start] = useTransition();

  if (!gap) return null;
  if (done) {
    return (
      <p className="rounded-control border border-status-done-fg/40 bg-status-done-bg px-3 py-2 text-sm">
        {done}
      </p>
    );
  }

  const understated = gap.gapPaise > 0;
  const paid = gap.paidPaise > 0;

  return (
    <div className="space-y-2 rounded-control border border-status-pending-fg/40 bg-status-pending-bg px-3 py-2.5">
      <p className="text-sm">
        <span className="font-medium">The books are behind this document.</span>{" "}
        {gap.vendorName} is posted at {formatPaise(gap.postedPaise)}, but the
        document now works out to {formatPaise(gap.shouldBePaise)} — a difference
        of {formatPaise(Math.abs(gap.gapPaise))}{" "}
        {understated ? "understated" : "overstated"}.
      </p>
      <p className="text-2xs text-text-muted">
        {/* The cause is worth naming: someone will otherwise assume the
            document is wrong rather than the posting. */}
        The purchase posts to the books once, when it is approved. Costs
        recomputed after that — a vendor changed, freight added, a quantity
        corrected — do not re-post on their own.
      </p>

      {paid ? (
        <p className="text-2xs text-status-danger-fg">
          {formatPaise(gap.paidPaise)} has already been paid against this bill, so
          it cannot be re-posted. Settle the difference with the vendor as a debit
          or credit note.
        </p>
      ) : !open ? (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Post the difference
        </Button>
      ) : (
        <div className="space-y-2">
          <textarea
            autoFocus
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Freight added after approval; payable never re-posted."
            className="w-full rounded-control border border-border bg-surface px-2 py-1.5 text-sm"
          />
          <p className="text-2xs text-text-subtle">
            Posted as its own entry dated today, leaving the original where it is.
            A month already closed is not reopened.
          </p>
          {error && <FieldError>{error}</FieldError>}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || reason.trim().length === 0}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await postBooksCorrection(inwardId, reason);
                  if (!r.ok) {
                    setError(r.error);
                    return;
                  }
                  setDone(
                    r.data
                      ? `Posted. ${r.data.docNo} now sits at ${formatPaise(r.data.nowPaise)}, up from ${formatPaise(r.data.wasPaise)}.`
                      : "The books already agree with this document.",
                  );
                  router.refresh();
                })
              }
            >
              {busy ? "Posting…" : `Post ${formatPaise(Math.abs(gap.gapPaise))}`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Not now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
