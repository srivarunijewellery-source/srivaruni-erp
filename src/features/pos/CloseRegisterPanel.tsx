"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { formatPaise } from "@/lib/money";
import { closeRegister, fetchDrawer } from "./actions";
import {
  DenominationCounter,
  denominationTotalPaise,
  type Denominations,
} from "./DenominationCounter";
import type { Drawer } from "./queries";

export function CloseRegisterPanel({
  sessionId,
  terminal,
  unsent,
  onClose,
}: {
  sessionId: string;
  terminal: string;
  unsent: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [denoms, setDenoms] = useState<Denominations>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Read the drawer fresh rather than trusting a figure rendered when the
  // counter loaded: sales and cash movements have happened since.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await fetchDrawer(sessionId);
      if (!cancelled && r.ok) setDrawer(r.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const counted = denominationTotalPaise(denoms);
  const expected = drawer?.expectedPaise ?? 0;
  const variance = counted - expected;
  const anythingCounted = Object.keys(denoms).length > 0;

  function doClose() {
    start(async () => {
      setError(null);
      const r = await closeRegister(sessionId, counted, note || null, denoms);
      if (r.ok) {
        setResult(r.data);
        router.refresh();
      } else {
        setError(r.error);
        setConfirming(false);
      }
    });
  }

  if (result) {
    const v = Number(result.variance_paise ?? 0);
    return (
      <Modal title={`${terminal} is closed`} onClose={onClose} width="max-w-lg">
        <div className="space-y-3">
          <div className="space-y-1.5 rounded-control bg-surface-sunken p-3 text-sm">
            <Row label="Opening float" value={formatPaise(Number(result.float_paise ?? 0))} />
            <Row label="Cash taken" value={formatPaise(Number(result.cash_sales_paise ?? 0))} />
            {Number(result.pay_in_paise ?? 0) > 0 && (
              <Row label="Paid in" value={`+ ${formatPaise(Number(result.pay_in_paise))}`} />
            )}
            {Number(result.pay_out_paise ?? 0) > 0 && (
              <Row label="Taken out" value={`- ${formatPaise(Number(result.pay_out_paise))}`} />
            )}
            {Number(result.expense_paise ?? 0) > 0 && (
              <Row label="Spent" value={`- ${formatPaise(Number(result.expense_paise))}`} />
            )}
            <div className="border-t border-border pt-1.5">
              <Row label="Expected" value={formatPaise(Number(result.expected_paise ?? 0))} />
              <Row label="Counted" value={formatPaise(Number(result.counted_paise ?? 0))} />
              <Row
                label={v === 0 ? "Balanced" : v > 0 ? "Over" : "Short"}
                value={formatPaise(Math.abs(v))}
                tone={v === 0 ? "ok" : "bad"}
              />
            </div>
            <div className="border-t border-border pt-1.5">
              <Row
                label={`Sales on ${Number(result.bills ?? 0)} bill${
                  Number(result.bills ?? 0) === 1 ? "" : "s"
                }`}
                value={formatPaise(Number(result.sales_paise ?? 0))}
              />
            </div>
          </div>

          <Button variant="primary" onClick={() => (window.location.href = "/pos")}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Close ${terminal}`} onClose={onClose} width="max-w-2xl">
      <div className="space-y-4">
        {unsent > 0 && (
          <p className="rounded-control bg-status-pending-bg px-3 py-2 text-2xs text-status-pending-fg">
            <Badge tone="pending">{unsent}</Badge> sale{unsent === 1 ? " is" : "s are"} still
            waiting to send. Close now and the count will not include them, so the variance
            will look wrong. Get back online first if you can.
          </p>
        )}

        <div className="rounded-card border border-border bg-surface-sunken p-3">
          <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-text-muted">
            What should be in this drawer
          </p>
          {!drawer ? (
            <p className="text-sm text-text-muted">Reading the drawer...</p>
          ) : (
            <div className="space-y-1.5 text-sm">
              <Row label="Opening float" value={formatPaise(drawer.openingFloatPaise)} />
              <Row
                label="Cash taken over the counter"
                value={`+ ${formatPaise(drawer.cashSalesPaise)}`}
              />
              {drawer.payInPaise > 0 && (
                <Row label="Paid in" value={`+ ${formatPaise(drawer.payInPaise)}`} />
              )}
              {drawer.payOutPaise > 0 && (
                <Row label="Taken out" value={`- ${formatPaise(drawer.payOutPaise)}`} />
              )}
              {drawer.expensePaise > 0 && (
                <Row
                  label="Spent from the drawer"
                  value={`- ${formatPaise(drawer.expensePaise)}`}
                />
              )}
              <div className="flex items-center justify-between border-t border-border pt-1.5 font-medium">
                <span>Expected</span>
                <span className="tnum font-mono text-lg">
                  {formatPaise(drawer.expectedPaise)}
                </span>
              </div>
              <p className="text-2xs text-text-subtle">
                Card {formatPaise(drawer.cardPaise)} and UPI {formatPaise(drawer.upiPaise)} are
                not in the drawer and are not counted here.
              </p>
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-text-muted">
            Count what is actually there
          </p>
          <DenominationCounter value={denoms} onChange={setDenoms} autoFocus />
        </div>

        {anythingCounted && drawer && (
          <div
            className={`flex items-center justify-between rounded-control px-3 py-2 text-sm ${
              variance === 0
                ? "bg-status-done-bg text-status-done-fg"
                : "bg-status-danger-bg text-status-danger-fg"
            }`}
          >
            <span className="font-medium">
              {variance === 0 ? "Balanced" : variance > 0 ? "Over by" : "Short by"}
            </span>
            <span className="tnum font-mono">
              {variance === 0 ? "-" : formatPaise(Math.abs(variance))}
            </span>
          </div>
        )}

        <div>
          <Label htmlFor="note">Note</Label>
          <Input
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={variance === 0 ? "Anything worth recording" : "Why the drawer is out"}
          />
          <p className="mt-1 text-2xs text-text-muted">
            The difference is recorded either way, so there is nothing to be gained by
            adjusting the count to match.
          </p>
        </div>

        <FieldError>{error}</FieldError>

        {/* Closing cannot be undone, so it takes two deliberate taps. */}
        {confirming ? (
          <div className="space-y-2 rounded-control border border-border bg-status-danger-bg p-3">
            <p className="text-sm text-status-danger-fg">
              Close {terminal} for good? No more bills can be rung on it.
            </p>
            <div className="flex gap-2">
              <Button variant="danger" onClick={doClose} disabled={pending}>
                {pending ? "Closing..." : "Yes, close it"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Go back
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() => setConfirming(true)}
              disabled={pending || !anythingCounted || !drawer}
            >
              {anythingCounted ? "Close register" : "Count the drawer first"}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "bad";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-text-muted">{label}</span>
      <span
        className={`tnum font-mono ${
          tone === "ok"
            ? "text-status-done-fg"
            : tone === "bad"
              ? "text-status-danger-fg"
              : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
