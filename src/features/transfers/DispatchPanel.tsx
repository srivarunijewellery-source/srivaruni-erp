"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Field";
import { LineProgress } from "./LineProgress";
import { approveAndDispatch, dispatchTransfer, rejectTransfer } from "./actions";
import { ROUTES } from "@/config/nav";
import type { TransferDetail } from "@/types/domain";

/**
 * The owner's screen: sign off on what is actually in the box and put it
 * on the road. Approval and dispatch are one press because they are one
 * decision, but they stay two database calls so each keeps its own
 * timestamp and its own name against it.
 */
export function DispatchPanel({ transfer }: { transfer: TransferDetail }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [courier, setCourier] = useState(transfer.courier ?? "");
  const [docket, setDocket] = useState(transfer.docketNo ?? "");
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const sent = transfer.lines.reduce((n, l) => n + l.qtySent, 0);
  const requested = transfer.lines.reduce((n, l) => n + l.qtyRequested, 0);
  const short = requested - sent;

  // Already approved, waiting only on the box physically leaving.
  const approved = transfer.status === "approved";

  function ship() {
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("transferId", transfer.id);
      if (courier.trim()) fd.set("courier", courier.trim());
      if (docket.trim()) fd.set("docket", docket.trim());
      const result = await (approved ? dispatchTransfer(fd) : approveAndDispatch(fd));
      if (!result.ok) setError(result.error);
    });
  }

  function reject() {
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("transferId", transfer.id);
      fd.set("reason", reason.trim());
      const result = await rejectTransfer(fd);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <span className="font-medium">In the box</span>
          <span className="tnum font-mono text-sm">
            {sent} of {requested} requested
          </span>
        </CardHeader>
        <CardBody className="py-0">
          <LineProgress lines={transfer.lines} mode="pick" />
        </CardBody>
      </Card>

      {short > 0 && (
        <Card>
          <CardBody>
            <p className="text-sm">
              <span className="font-medium text-status-danger-fg">
                {short} {short === 1 ? "piece" : "pieces"} could not be found.
              </span>{" "}
              {transfer.pickNote ? (
                <span className="text-text-muted">“{transfer.pickNote}”</span>
              ) : (
                <span className="text-text-muted">No reason was recorded.</span>
              )}
            </p>
            <p className="mt-1 text-2xs text-text-muted">
              Those pieces stay on the shelf at {transfer.fromCode}. Nothing is written off.
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <span className="font-medium">
            {approved ? "Put it on the road" : "Approve and ship"}
          </span>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="courier">Courier</Label>
              <Input
                id="courier"
                value={courier}
                onChange={(e) => setCourier(e.target.value)}
                placeholder="DTDC"
              />
            </div>
            <div>
              <Label htmlFor="docket">Docket number</Label>
              <Input
                id="docket"
                value={docket}
                onChange={(e) => setDocket(e.target.value)}
                placeholder="X1234567"
                className="font-mono"
              />
            </div>
          </div>

          <p className="text-2xs text-text-muted">
            The moment you ship, these {sent} {sent === 1 ? "piece" : "pieces"} leave{" "}
            {transfer.fromCode} and belong to no store until {transfer.toCode} confirms
            receipt. They will not be sellable anywhere in between.
          </p>

          {error && <FieldError>{error}</FieldError>}

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="lg" disabled={pending || sent === 0} onClick={ship}>
              {pending ? "Shipping…" : approved ? "Mark dispatched" : "Approve and ship"}
            </Button>
            <a href={ROUTES.transferSlip(transfer.id)} target="_blank" rel="noreferrer">
              <Button type="button" variant="secondary" size="lg">
                Pickup slip
              </Button>
            </a>
            {!approved && (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => setRejecting((v) => !v)}
              >
                Send back
              </Button>
            )}
          </div>

          {rejecting && (
            <div className="space-y-2 border-t border-border pt-3">
              <Label htmlFor="reject-reason">Why is this going back?</Label>
              <Input
                id="reject-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Zaheerabad already has these, hold them here"
              />
              <Button
                variant="danger"
                disabled={pending || !reason.trim()}
                onClick={reject}
              >
                {pending ? "Sending back…" : "Confirm send back"}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
