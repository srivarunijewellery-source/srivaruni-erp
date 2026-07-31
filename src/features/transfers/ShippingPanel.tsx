"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Field";
import { LineProgress } from "./LineProgress";
import { dispatchTransfer } from "./actions";
import { ROUTES } from "@/config/nav";
import type { TransferDetail } from "@/types/domain";

/**
 * Only reachable once a manager or the owner has approved. Nothing here
 * can change what ships -- that was decided on the approval screen. This
 * page only adds how it travels and marks it gone.
 */
export function ShippingPanel({ transfer }: { transfer: TransferDetail }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [courier, setCourier] = useState(transfer.courier ?? "");
  const [docket, setDocket] = useState(transfer.docketNo ?? "");

  const sent = transfer.lines.reduce((n, l) => n + l.qtySent, 0);

  function ship() {
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("transferId", transfer.id);
      if (courier.trim()) fd.set("courier", courier.trim());
      if (docket.trim()) fd.set("docket", docket.trim());
      const result = await dispatchTransfer(fd);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <span className="font-medium">Approved -- ready to ship</span>
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
              {pending ? "Shipping…" : "Mark dispatched"}
            </Button>
            <a href={ROUTES.transferSlip(transfer.id)} target="_blank" rel="noreferrer">
              <Button type="button" variant="secondary" size="lg">
                Pickup slip
              </Button>
            </a>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <span className="font-medium">Shipping</span>
          <span className="tnum font-mono text-sm">{sent} pieces</span>
        </CardHeader>
        <CardBody className="py-0">
          <LineProgress lines={transfer.lines} mode="pick" />
        </CardBody>
      </Card>
    </div>
  );
}
