"use client";

import { useState } from "react";
import { loadReceiptForReprint } from "./reprint-actions";
import { printReceipt } from "./receipt";

/**
 * Reprints a past invoice from the list.
 *
 * The receipt is rebuilt on the server from stored values rather than
 * from anything held on this machine, so any invoice can be reprinted
 * from any screen — not just the last one rung at this till.
 */
export function ReprintButton({
  billId,
  billNo,
}: {
  billId: string;
  billNo: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const r = await loadReceiptForReprint(billId);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    printReceipt(r.data);
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        aria-label={`Reprint invoice ${billNo}`}
        className="rounded-control border border-border px-2 py-1 text-2xs hover:border-brand hover:text-brand disabled:opacity-50"
      >
        {busy ? "Preparing…" : "Reprint"}
      </button>
      {error && (
        <span className="mt-0.5 max-w-40 text-right text-2xs text-status-danger-fg">
          {error}
        </span>
      )}
    </span>
  );
}
