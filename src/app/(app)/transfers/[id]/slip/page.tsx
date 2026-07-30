import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { getTransfer } from "@/features/transfers/queries";
import { PrintButton } from "@/features/transfers/PrintButton";
import { formatDateTime } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { APP } from "@/config/app";

export const metadata: Metadata = { title: "Pickup slip" };

/**
 * The sheet that travels with the box.
 *
 * Printed, not exported: a packing list is read by a person holding a
 * carton, so it needs real tick boxes and a barcode column at a size a
 * hand can follow down the page. The CSV route exists alongside for
 * anyone who wants the same lines in a spreadsheet.
 *
 * Print isolation is done with visibility rather than by moving this out
 * of the app layout, so the navigation shell stays untouched.
 */
export default async function SlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [, transfer] = await Promise.all([requireUser(), getTransfer(id)]);
  if (!transfer) notFound();

  // Before the pick is sealed the slip is a picking list of what was asked
  // for. After, it is a packing list of what is actually in the box.
  const sealed = !["requested", "picking"].includes(transfer.status);
  const qtyOf = (l: (typeof transfer.lines)[number]) =>
    sealed ? l.qtySent : l.qtyRequested;

  const lines = transfer.lines.filter((l) => qtyOf(l) > 0);
  const totalQty = lines.reduce((n, l) => n + qtyOf(l), 0);
  const totalValue = lines.reduce(
    (n, l) => n + (l.sellingPricePaise ?? 0) * qtyOf(l),
    0,
  );
  const shortfall = transfer.lines.reduce(
    (n, l) => n + (sealed ? l.qtyRequested - l.qtySent : 0),
    0,
  );

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #slip, #slip * { visibility: visible; }
          #slip { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
          .no-print { display: none !important; }
          @page { margin: 14mm; }
        }
      `}</style>

      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          Print this and send it in the box. The receiving store ticks each line as it
          scans.
        </p>
        <PrintButton transferId={transfer.id} />
      </div>

      <div id="slip" className="rounded-card border border-border bg-surface p-6 text-text">
        <header className="mb-4 flex items-start justify-between gap-4 border-b border-border pb-3">
          <div>
            <h1 className="text-lg font-semibold">{APP.name ?? "Sri Varuni"}</h1>
            <p className="text-sm">
              {sealed ? "Packing list" : "Picking list"} ·{" "}
              <span className="font-mono">{transfer.docNo}</span>
            </p>
          </div>
          <div className="text-right text-sm">
            <p>
              <span className="text-text-muted">From </span>
              {transfer.fromName}
            </p>
            <p>
              <span className="text-text-muted">To </span>
              {transfer.toName}
            </p>
            <p className="text-2xs text-text-muted">
              {formatDateTime(transfer.dispatchedAt ?? transfer.pickedAt ?? transfer.requestedAt)}
            </p>
          </div>
        </header>

        <dl className="mb-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Meta label="Courier" value={transfer.courier} />
          <Meta label="Docket" value={transfer.docketNo} mono />
          <Meta label="Reason" value={transfer.reason} />
          <Meta label="Items" value={`${lines.length}`} />
        </dl>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-border text-2xs uppercase tracking-wide text-text-muted">
              <th className="w-10 px-2 py-1.5 text-left">✓</th>
              <th className="px-2 py-1.5 text-left">Barcode</th>
              <th className="px-2 py-1.5 text-left">Item</th>
              <th className="px-2 py-1.5 text-left">Category</th>
              <th className="px-2 py-1.5 text-right">Qty</th>
              <th className="px-2 py-1.5 text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-border">
                <td className="px-2 py-2">
                  <span className="inline-block h-4 w-4 border border-text-muted" />
                </td>
                <td className="px-2 py-2 font-mono text-2xs">{l.barcode}</td>
                <td className="px-2 py-2">{l.name}</td>
                <td className="px-2 py-2 text-text-muted">{l.category}</td>
                <td className="tnum px-2 py-2 text-right font-mono font-semibold">
                  {qtyOf(l)}
                </td>
                <td className="tnum px-2 py-2 text-right font-mono">
                  {formatPaise((l.sellingPricePaise ?? 0) * qtyOf(l))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-b-2 border-text font-semibold">
              <td className="px-2 py-2" colSpan={4}>
                Total
              </td>
              <td className="tnum px-2 py-2 text-right font-mono">{totalQty}</td>
              <td className="tnum px-2 py-2 text-right font-mono">
                {formatPaise(totalValue)}
              </td>
            </tr>
          </tfoot>
        </table>

        {shortfall > 0 && (
          <p className="mt-3 text-sm">
            <span className="font-medium">
              {shortfall} requested {shortfall === 1 ? "piece was" : "pieces were"} not
              packed.
            </span>{" "}
            {transfer.pickNote && <span className="text-text-muted">{transfer.pickNote}</span>}
          </p>
        )}

        <div className="mt-8 grid grid-cols-2 gap-8 text-sm">
          <Signature label={`Packed at ${transfer.fromCode} by`} />
          <Signature label={`Received at ${transfer.toCode} by`} />
        </div>

        <p className="mt-6 text-2xs text-text-muted">
          Until this box is received, every piece on it is in transit and counts towards no
          store.
        </p>
      </div>
    </>
  );
}

function Meta({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className={mono ? "font-mono" : undefined}>{value || "—"}</dd>
    </div>
  );
}

function Signature({ label }: { label: string }) {
  return (
    <div>
      <div className="h-10 border-b border-text-muted" />
      <p className="mt-1 text-2xs text-text-muted">{label}</p>
      <div className="mt-4 h-6 border-b border-text-muted" />
      <p className="mt-1 text-2xs text-text-muted">Date</p>
    </div>
  );
}
