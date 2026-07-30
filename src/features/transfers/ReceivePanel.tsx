"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Field";
import { ScanBox } from "./ScanBox";
import { LineProgress } from "./LineProgress";
import { receiveTransfer, scanReceive } from "./actions";
import { formatDateTime } from "@/lib/format";
import type { TransferDetail } from "@/types/domain";

export function ReceivePanel({ transfer }: { transfer: TransferDetail }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sent = transfer.lines.reduce((n, l) => n + l.qtySent, 0);
  const scanned = transfer.lines.reduce((n, l) => n + (l.qtyReceived ?? 0), 0);

  // Null across the board means nobody has scanned anything yet, which is
  // different from having scanned zero. Until the first scan the document
  // still means "assume it all arrived".
  const untouched = transfer.lines.every((l) => l.qtyReceived === null);
  const missing = sent - scanned;

  function post() {
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("transferId", transfer.id);
      const result = await receiveTransfer(fd);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <p className="text-sm">
            Dispatched from {transfer.fromName} on {formatDateTime(transfer.dispatchedAt)}
            {transfer.courier && <> by {transfer.courier}</>}
            {transfer.docketNo && (
              <>
                {" "}
                · docket <span className="font-mono">{transfer.docketNo}</span>
              </>
            )}
            .
          </p>
          <p className="mt-1 text-2xs text-text-muted">
            These {sent} {sent === 1 ? "piece is" : "pieces are"} in transit and count
            towards no store. They land at {transfer.toCode} only when you confirm below.
          </p>
          {transfer.pickNote && (
            <p className="mt-2 text-sm">
              <span className="font-medium">Note from {transfer.fromCode}:</span>{" "}
              <span className="text-text-muted">“{transfer.pickNote}”</span>
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <span className="font-medium">Scan out of the box</span>
          <span className="tnum font-mono text-sm">
            {untouched ? "—" : scanned} / {sent}
          </span>
        </CardHeader>
        <CardBody>
          <ScanBox
            transferId={transfer.id}
            action={scanReceive}
            verb="Received"
            disabled={pending}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <span className="font-medium">What was sent</span>
        </CardHeader>
        <CardBody className="py-0">
          <LineProgress lines={transfer.lines} mode="receive" />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          {untouched ? (
            <p className="text-sm text-text-muted">
              Nothing scanned yet. Confirming now accepts the whole box as it was sent —
              use that only for a box you have counted by hand.
            </p>
          ) : missing > 0 ? (
            <p className="text-sm">
              <span className="font-medium text-status-danger-fg">
                {missing} {missing === 1 ? "piece is" : "pieces are"} unaccounted for.
              </span>{" "}
              Confirming now books what you scanned into {transfer.toCode} and logs the rest
              as lost in transit, against this document, so it can be chased with the
              courier. It will not be counted as stock anywhere.
            </p>
          ) : (
            <p className="text-sm text-status-done-fg">
              Everything that was sent has been scanned.
            </p>
          )}

          {error && <FieldError>{error}</FieldError>}

          <Button variant="primary" size="lg" disabled={pending} onClick={post}>
            {pending ? "Booking in…" : `Confirm receipt at ${transfer.toCode}`}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
