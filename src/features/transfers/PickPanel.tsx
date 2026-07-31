"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Field";
import { ScanBox } from "./ScanBox";
import { LineProgress } from "./LineProgress";
import { confirmPick, scanPick, startPick } from "./actions";
import { ROUTES } from "@/config/nav";
import type { TransferDetail } from "@/types/domain";

export function PickPanel({ transfer }: { transfer: TransferDetail }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const requested = transfer.lines.reduce((n, l) => n + l.qtyRequested, 0);
  const picked = transfer.lines.reduce((n, l) => n + l.qtyPicked, 0);
  const shortLines = transfer.lines.filter((l) => l.qtyPicked < l.qtyRequested);
  const complete = shortLines.length === 0;

  function run(action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("transferId", transfer.id);
      if (note.trim()) fd.set("note", note.trim());
      const result = await action(fd);
      if (!result.ok) setError(result.error ?? "Something went wrong.");
    });
  }

  if (transfer.status === "requested") {
    return (
      <div className="space-y-4">
        <Card>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">Ready to pick</p>
                <p className="mt-0.5 text-sm text-text-muted">
                  {requested} {requested === 1 ? "piece" : "pieces"} across{" "}
                  {transfer.lines.length} {transfer.lines.length === 1 ? "item" : "items"}.
                  Print the slip and take a phone or tablet to the rail.
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <a href={ROUTES.transferSlip(transfer.id)} target="_blank" rel="noreferrer">
                  <Button type="button" variant="secondary">
                    Pickup slip
                  </Button>
                </a>
                <Button
                  variant="primary"
                  size="lg"
                  disabled={pending || transfer.lines.length === 0}
                  onClick={() => run(startPick)}
                >
                  {pending ? "Opening…" : "Start picking"}
                </Button>
              </div>
            </div>
            {error && <FieldError>{error}</FieldError>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <span className="font-medium">On this request</span>
          </CardHeader>
          <CardBody className="py-0">
            <LineProgress lines={transfer.lines} mode="pick" showAvailable />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">
                {complete ? "Everything requested is in the box." : "Ready to send for approval"}
              </p>
              <p className="tnum mt-0.5 font-mono text-sm text-text-muted">
                {picked} / {requested} scanned
              </p>
            </div>
            <Button
              variant="primary"
              size="lg"
              disabled={pending || picked === 0 || (!complete && !note.trim())}
              onClick={() => run(confirmPick)}
            >
              {pending ? "Sending…" : "Send for approval"}
            </Button>
          </div>

          {!complete && (
            <div className="border-t border-border pt-3">
              <p className="text-sm">
                <span className="font-medium text-status-danger-fg">
                  {shortLines.length} {shortLines.length === 1 ? "line" : "lines"} short.
                </span>{" "}
                The box will ship with what it holds, and the receiving store will be told
                what to expect. Say what happened.
              </p>
              <div className="mt-2">
                <Label htmlFor="pick-note">Why is it short?</Label>
                <Input
                  id="pick-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Two bangles not on the rail, may be on display"
                />
              </div>
            </div>
          )}

          {error && <FieldError>{error}</FieldError>}

          {picked === 0 && (
            <p className="text-2xs text-text-muted">
              Nothing scanned yet. If none of it can be found, cancel the request rather
              than sending an empty box for approval.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <span className="font-medium">Scan into the box</span>
          <span className="tnum font-mono text-sm">
            {picked} / {requested}
          </span>
        </CardHeader>
        <CardBody>
          <ScanBox
            transferId={transfer.id}
            action={scanPick}
            verb="Picked"
            disabled={pending}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <span className="font-medium">On this request</span>
        </CardHeader>
        <CardBody className="py-0">
          <LineProgress lines={transfer.lines} mode="pick" showAvailable />
        </CardBody>
      </Card>
    </div>
  );
}
