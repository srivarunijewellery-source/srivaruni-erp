"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, NarrowInput, FieldError } from "@/components/ui/Field";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { itemPhotoUrl } from "@/lib/storage";
import {
  scanAudit, setAuditCount, submitAudit, approveAudit,
  type ScanOutcome,
} from "./actions";
import type { AuditDetail } from "./queries";

/**
 * Counting a shelf.
 *
 * Open count, as asked: expected quantity is on the slip. The check is
 * that every tag is physically read -- scanned, or typed when a label
 * will not scan, exactly as the transfer pick works. Nothing can be
 * submitted until every line has a number against it, including the
 * zeroes, because an uncounted line submitted as complete would post as
 * missing stock.
 *
 * The scan box holds focus throughout. A counter works two-handed with a
 * gun and a tray, and every click back into the field is a piece put
 * down.
 */
export function AuditCounter({
  audit,
  canApprove,
}: {
  audit: AuditDetail;
  canApprove: boolean;
}) {
  const router = useRouter();
  const scanRef = useRef<HTMLInputElement>(null);
  const [tag, setTag] = useState("");
  const [last, setLast] = useState<ScanOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const counting = audit.status === "counting";
  const pending = audit.rows.filter((r) => r.countedQty === null).length;
  const variances = audit.rows.filter(
    (r) => r.countedQty !== null && r.countedQty !== r.expectedQty,
  );

  useEffect(() => {
    if (counting) scanRef.current?.focus();
  }, [counting, last]);

  function submitTag() {
    const t = tag.trim();
    if (!t) return;
    start(async () => {
      setError(null);
      const r = await scanAudit(audit.id, t);
      setTag("");
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setLast(r.data);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* The slip, landscape and on paper.
          Counting happens at the rack, not at the screen -- someone
          walks off with a list, ticks it, and comes back. Printing the
          whole page would put the scan box and a wall of thumbnails on
          the sheet; what is wanted is codes, tags, names, what the books
          expect and a blank to write the count in. */}
      <style>{`
        @media print {
          @page { size: landscape; margin: 12mm; }
          body * { visibility: hidden; }
          .audit-slip, .audit-slip * { visibility: visible; }
          .audit-slip { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      {done && (
        <p className="rounded-control border border-status-done-fg/40 bg-status-done-bg px-3 py-2 text-sm">
          {done}
        </p>
      )}

      {counting && (
        <Card className="no-print">
          <CardBody className="space-y-2">
            <Input
              ref={scanRef}
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitTag();
                }
              }}
              placeholder="Scan a tag, or type it and press Enter"
              autoFocus
              aria-label="Scan or type a tag"
            />
            <p className="text-2xs text-text-muted">
              One scan is one piece. A tag that will not read can be typed here,
              or the count entered against its row below.
            </p>

            {last && (
              <p
                className={`text-sm ${
                  last.outcome === "unknown" || last.outcome === "over"
                    ? "text-status-danger-fg"
                    : last.outcome === "unexpected"
                      ? "text-status-pending-fg"
                      : "text-status-done-fg"
                }`}
              >
                {last.outcome === "unknown"
                  ? last.message
                  : `${last.barcode} · ${last.name} · counted ${last.counted} of ${last.expected}${
                      last.outcome === "over"
                        ? " — more than expected"
                        : last.outcome === "unexpected"
                          ? " — not on this slip, counted anyway"
                          : ""
                    }`}
              </p>
            )}
            {error && <FieldError>{error}</FieldError>}
          </CardBody>
        </Card>
      )}

      <Card className="no-print">
        <CardBody className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span>
            <span className="tnum text-2xl font-semibold">
              {audit.counted}/{audit.lines}
            </span>{" "}
            <span className="text-sm text-text-muted">counted</span>
          </span>
          {pending > 0 && (
            <span className="text-2xs text-status-pending-fg">
              {pending} still to check
            </span>
          )}
          {variances.length > 0 && (
            <span className="text-2xs text-status-danger-fg">
              {variances.length} do not match
            </span>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="ml-auto rounded-control border border-border-strong px-2.5 py-1 text-2xs hover:bg-surface-sunken"
          >
            Print the slip
          </button>
        </CardBody>
      </Card>

      <AuditSlip audit={audit} />

      <ul className="no-print space-y-1.5">
        {audit.rows.map((r) => {
          const diff = r.countedQty === null ? null : r.countedQty - r.expectedQty;
          return (
            <li
              key={r.id}
              className={`flex flex-wrap items-center gap-3 rounded-card border px-3 py-2 ${
                r.countedQty === null
                  ? "border-border bg-surface"
                  : diff === 0
                    ? "border-border bg-surface-sunken"
                    : "border-status-danger-fg/40 bg-status-danger-bg"
              }`}
            >
              <PhotoThumb src={itemPhotoUrl(r.photoPath)} alt={r.name} size={36} />
              <span className="min-w-40 flex-1">
                <span className="block truncate text-sm">{r.name}</span>
                <span className="font-mono text-2xs text-text-subtle">
                  {r.barcode}
                  {r.variant ? ` · ${r.variant}` : ""} · {r.category}
                  {r.unexpected && " · not on the original slip"}
                </span>
              </span>

              <span className="tnum text-2xs text-text-muted">
                expected {r.expectedQty}
              </span>

              <NarrowInput
                widthClass="w-16"
                type="number"
                min={0}
                inputMode="numeric"
                defaultValue={r.countedQty === null ? "" : String(r.countedQty)}
                disabled={!counting || busy}
                placeholder="—"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  const n = v === "" ? null : Number(v);
                  if (n !== null && (!Number.isInteger(n) || n < 0)) return;
                  if (n === r.countedQty) return;
                  start(async () => {
                    const res = await setAuditCount(audit.id, r.id, n);
                    if (!res.ok) setError(res.error);
                    else router.refresh();
                  });
                }}
                className="tnum text-right"
                aria-label={`Counted quantity for ${r.barcode}`}
              />

              <span className="tnum w-14 text-right text-2xs">
                {diff === null ? (
                  <span className="text-text-subtle">not yet</span>
                ) : diff === 0 ? (
                  <span className="text-status-done-fg">ok</span>
                ) : (
                  <span className="text-status-danger-fg">
                    {diff > 0 ? "+" : ""}
                    {diff}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="no-print flex flex-wrap gap-2">
        {counting && (
          <Button
            disabled={busy || pending > 0}
            title={
              pending > 0
                ? `${pending} line(s) still need a count, including any zeroes.`
                : undefined
            }
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await submitAudit(audit.id);
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                setDone(
                  r.data.variances === 0
                    ? `${r.data.docNo} submitted. Everything matched.`
                    : `${r.data.docNo} submitted with ${r.data.variances} variance(s) for approval.`,
                );
                router.refresh();
              })
            }
          >
            {pending > 0 ? `${pending} still to count` : "Submit the count"}
          </Button>
        )}

        {audit.status === "submitted" && canApprove && (
          <Button
            disabled={busy}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await approveAudit(audit.id);
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                setDone(
                  `Approved. ${r.data.linesAdjusted} line(s) adjusted on ${r.data.adjustment}, ${
                    r.data.netPieces >= 0 ? "+" : ""
                  }${r.data.netPieces} pieces net.`,
                );
                router.refresh();
              })
            }
          >
            Approve and post the variance
          </Button>
        )}
      </div>

      {audit.status === "submitted" && !canApprove && (
        <p className="text-2xs text-text-muted">
          Submitted. The owner posts the variance.
        </p>
      )}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}


/**
 * The paper version.
 *
 * Hidden on screen, because the grid above already says everything it
 * says and better. On paper it is the only thing: tag, item, what the
 * books expect, and a ruled box to write the count into. No photographs
 * -- a thumbnail is useless at print resolution and doubles the page
 * count of a 150-line shelf.
 */
function AuditSlip({ audit }: { audit: AuditDetail }) {
  return (
    <div className="audit-slip hidden print:block">
      <p className="mb-1 text-base font-medium">
        {audit.docNo} · {audit.locationCode}
      </p>
      <p className="mb-3 text-[11px]">
        {audit.note ? `${audit.note} · ` : ""}
        {audit.lines} lines · counted by ________________ on ____ / ____ / ______
      </p>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1 pr-2">Tag</th>
            <th className="py-1 pr-2">Item</th>
            <th className="py-1 pr-2">Size</th>
            <th className="py-1 pr-2 text-right">Books say</th>
            <th className="py-1 text-right">Counted</th>
          </tr>
        </thead>
        <tbody>
          {audit.rows.map((r) => (
            <tr key={r.id} className="border-b border-neutral-300">
              <td className="py-1 pr-2 font-mono">{r.barcode}</td>
              <td className="max-w-72 truncate py-1 pr-2">{r.name}</td>
              <td className="py-1 pr-2">{r.variant ?? ""}</td>
              <td className="py-1 pr-2 text-right">{r.expectedQty}</td>
              {/* Left blank deliberately: this is what someone writes in
                  at the rack and types back at the screen. */}
              <td className="w-20 py-1 text-right">&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
