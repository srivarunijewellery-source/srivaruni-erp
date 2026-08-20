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
      {done && (
        <p className="rounded-control border border-status-done-fg/40 bg-status-done-bg px-3 py-2 text-sm">
          {done}
        </p>
      )}

      {counting && (
        <Card>
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

      <Card>
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
        </CardBody>
      </Card>

      <ul className="space-y-1.5">
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

      <div className="flex flex-wrap gap-2">
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
