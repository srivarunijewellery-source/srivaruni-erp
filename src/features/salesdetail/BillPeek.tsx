"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatPaise } from "@/lib/money";
import { loadReceiptForReprint } from "@/features/pos/reprint-actions";
import { printReceipt } from "@/features/pos/receipt";
import type { ReceiptData } from "@/features/pos/receipt";

/**
 * The invoice behind a sales line, without leaving the page.
 *
 * The bill number used to link through to the sales list filtered by
 * that number — which is a search results page showing one row, from
 * which the actual invoice is still another click away, and the filters
 * and scroll position on this page are gone by the time you come back.
 * Nobody wants a list of one. They want to see what was on the bill.
 *
 * So this opens over the top instead: what was bought, who bought it,
 * what was paid, and a reprint. Closing puts you back exactly where you
 * were, filters intact.
 *
 * Everything is read through loadReceiptForReprint rather than a query
 * of its own. It already assembles a bill from stored values for the
 * printer, and a second reader would be a second set of rules about
 * which figures to trust — right up until the day they disagree.
 */
export function BillPeek({ billId, billNo }: { billId: string; billNo: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ReceiptData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function show() {
    setOpen(true);
    if (data || busy) return;
    setBusy(true);
    setError(null);
    const r = await loadReceiptForReprint(billId);
    setBusy(false);
    if (r.ok) setData(r.data);
    else setError(r.error);
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="font-mono text-brand hover:underline"
        aria-label={`Open invoice ${billNo}`}
      >
        {billNo}
      </button>

      {open && (
        <Modal title={billNo} onClose={() => setOpen(false)} width="max-w-lg">
          {busy && <p className="py-6 text-center text-sm text-text-muted">Reading the invoice…</p>}
          {error && <p className="py-6 text-center text-sm text-status-danger-fg">{error}</p>}

          {data && (
            <div className="space-y-3">
              <div className="flex flex-wrap justify-between gap-2 text-2xs">
                <span>
                  <span className="block text-text-subtle">Customer</span>
                  <span className="text-sm">
                    {data.customerName ?? "Walk-in"}
                  </span>
                  {data.customerPhone && (
                    <span className="block font-mono text-text-muted">
                      {data.customerPhone}
                    </span>
                  )}
                </span>
                <span className="text-right">
                  <span className="block text-text-subtle">
                    {data.dateText} · {data.locationName}
                  </span>
                  <span className="block text-text-muted">
                    Sold by {data.staffName || "—"}
                  </span>
                </span>
              </div>

              <ul className="divide-y divide-border rounded-card border border-border">
                {data.lines.map((l, i) => (
                  <li key={i} className="flex items-baseline gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{l.name}</span>
                      <span className="text-2xs text-text-muted">
                        {l.qty} × {formatPaise(l.unitPaise)}
                        {l.discountPaise > 0 && ` · less ${formatPaise(l.discountPaise)}`}
                      </span>
                    </span>
                    <span className="tnum font-mono text-sm">
                      {formatPaise(l.totalPaise)}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Gifts are on the bill but are not a line with a price,
                  so they would otherwise vanish from this view entirely
                  and the piece count would not reconcile. */}
              {data.gifts.length > 0 && (
                <ul className="text-2xs text-text-muted">
                  {data.gifts.map((g, i) => (
                    <li key={i}>
                      Gift · {g.itemName} × {g.qty} ({g.name})
                    </li>
                  ))}
                </ul>
              )}

              <dl className="space-y-0.5 border-t border-border pt-2 text-2xs">
                <Row label="Gross" paise={data.grossPaise} />
                {data.discountPaise > 0 && (
                  <Row label="Discount" paise={-data.discountPaise} />
                )}
                <Row label="Taxable" paise={data.taxablePaise} />
                {data.cgstPaise > 0 && <Row label="CGST" paise={data.cgstPaise} />}
                {data.sgstPaise > 0 && <Row label="SGST" paise={data.sgstPaise} />}
                {data.igstPaise > 0 && <Row label="IGST" paise={data.igstPaise} />}
                {data.roundOffPaise !== 0 && (
                  <Row label="Round off" paise={data.roundOffPaise} />
                )}
                <div className="flex justify-between pt-1 text-sm font-medium">
                  <dt>Total</dt>
                  <dd className="tnum font-mono">{formatPaise(data.totalPaise)}</dd>
                </div>
              </dl>

              {data.payments.length > 0 && (
                <p className="text-2xs text-text-muted">
                  Paid by{" "}
                  {data.payments
                    .map((p) => `${p.method} ${formatPaise(p.amount_paise)}`)
                    .join(", ")}
                </p>
              )}

              <div className="flex gap-2">
                <Button onClick={() => printReceipt(data)}>Print duplicate</Button>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

function Row({ label, paise }: { label: string; paise: number }) {
  return (
    <div className="flex justify-between text-text-muted">
      <dt>{label}</dt>
      <dd className="tnum font-mono">{formatPaise(paise)}</dd>
    </div>
  );
}
