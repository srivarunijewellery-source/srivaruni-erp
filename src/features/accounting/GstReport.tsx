"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { formatPaise } from "@/lib/money";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { ROUTES } from "@/config/nav";
import { backfillAccounting } from "./actions";
import type { GstRow } from "./queries";

export function GstReport({
  rows,
  from,
  to,
  unpostedCount,
  error: loadError,
  adjusted,
}: {
  rows: GstRow[];
  from: string;
  to: string;
  unpostedCount: number;
  /** The summary could not be built — usually too wide a period. Shown
   *  as a message rather than thrown, which would take the page down. */
  error?: string | null;
  adjusted?: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const output = rows.find((r) => r.label.startsWith("Output"));
  const input = rows.find((r) => r.label.startsWith("Input"));
  const net = rows.find((r) => r.label.startsWith("Net"));

  function runBackfill() {
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await backfillAccounting();
      if (r.ok) setNotice(r.data);
      else setError(r.error);
    });
  }

  return (
    <div className="space-y-4">
      {unpostedCount > 0 && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                <Badge tone="danger">{unpostedCount}</Badge>{" "}
                {unpostedCount === 1 ? "document is" : "documents are"} not in the books
              </p>
              <p className="mt-1 text-2xs text-text-muted">
                These figures are incomplete until they post — input credit especially,
                since unposted purchases mean credit you are entitled to is not counted.
              </p>
            </div>
            <Button variant="secondary" onClick={runBackfill} disabled={pending}>
              {pending ? "Posting…" : "Post them now"}
            </Button>
          </CardBody>
        </Card>
      )}

      {notice && <p className="text-sm text-status-done-fg">{notice}</p>}
      <FieldError>{error}</FieldError>

      <Card>
        <CardBody>
          <DateRangePicker basePath={ROUTES.gst} from={from} to={to} maxDays={400} />
        </CardBody>
      </Card>

      {adjusted && (
        <p className="rounded-control border border-status-pending-fg/40 bg-status-pending-bg px-3 py-2 text-sm">
          {adjusted}
        </p>
      )}

      {loadError && (
        <Card>
          <CardBody>
            <p className="text-sm font-medium text-status-danger-fg">
              This period could not be totalled
            </p>
            <p className="mt-1 text-sm text-text-muted">{loadError}</p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader className="font-medium">For the period</CardHeader>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <p className="text-sm">Output tax on sales</p>
              <p className="text-2xs text-text-muted">
                Collected from customers on {formatPaise(output?.taxablePaise ?? 0)} of
                taxable sales
              </p>
            </div>
            <span className="font-mono">{formatPaise(output?.taxPaise ?? 0)}</span>
          </div>

          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <p className="text-sm">Less: input credit</p>
              <p className="text-2xs text-text-muted">
                Paid to vendors and on expenses where credit is claimable
              </p>
            </div>
            <span className="font-mono">− {formatPaise(input?.taxPaise ?? 0)}</span>
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="font-medium">Net payable</p>
            <span className="font-mono text-lg">{formatPaise(net?.taxPaise ?? 0)}</span>
          </div>
        </CardBody>
      </Card>

      <p className="px-1 text-2xs text-text-muted">
        Read from the posted books rather than from bills and invoices directly, so these
        figures reconcile with the trial balance by construction. A document that never
        posted is missing here and flagged above, rather than inflating one report and
        not the other. This is a working summary, not a filed return — check it against
        the portal before filing.
      </p>
    </div>
  );
}
