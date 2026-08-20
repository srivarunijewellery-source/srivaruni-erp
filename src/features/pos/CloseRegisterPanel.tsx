"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { CounterNoteButton } from "./CounterNoteButton";
import { Input, Label, FieldError } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { formatPaise } from "@/lib/money";
import { closeRegister, fetchDrawer, fetchSessionPayments } from "./actions";
import {
  DenominationCounter,
  denominationTotalPaise,
  type Denominations,
} from "./DenominationCounter";
import type { Drawer, SessionPayment } from "./queries";

export function CloseRegisterPanel({
  sessionId,
  terminal,
  unsent,
  locationId,
  onClose,
}: {
  sessionId: string;
  terminal: string;
  unsent: number;
  /** For the note prompt below: which branch a note defaults to. */
  locationId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [denoms, setDenoms] = useState<Denominations>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  /** Non-cash payments, listed separately: the drawer can be counted,
   *  these can only be checked against the app that took them. */
  const [payments, setPayments] = useState<SessionPayment[]>([]);
  const [confirming, setConfirming] = useState(false);

  // Read the drawer fresh rather than trusting a figure rendered when the
  // counter loaded: sales and cash movements have happened since.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [r, p] = await Promise.all([
        fetchDrawer(sessionId),
        fetchSessionPayments(sessionId),
      ]);
      if (cancelled) return;
      if (r.ok) setDrawer(r.data);
      if (p.ok) setPayments(p.data.filter((x) => x.method !== "cash"));
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

          {/* Printed before leaving, because the figures are gone from
              the screen the moment the counter closes and a paper copy
              is what gets signed and handed over. */}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => printClosing(result, payments, terminal)}>
              Print the counter slip
            </Button>
            <Button variant="primary" onClick={() => (window.location.href = "/pos")}>
              Done
            </Button>
          </div>
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

        {/* Non-cash, listed rather than totalled.
        
            The drawer variance only ever describes CASH. A UPI figure
            can be wrong without the drawer being a rupee out, so the
            payments are shown one by one to be checked against the app
            before the counter is signed off. */}
        {payments.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-2xs font-medium uppercase tracking-wide text-text-subtle">
                Paid by phone and card
              </p>
              <p className="tnum text-2xs">
                {payments.length} payment{payments.length === 1 ? "" : "s"} ·{" "}
                {formatPaise(payments.reduce((n, p) => n + p.amountPaise, 0))}
              </p>
            </div>
            <ul className="max-h-44 divide-y divide-border overflow-auto rounded-control border border-border">
              {payments.map((p) => (
                <li
                  key={`${p.billId}-${p.seq}`}
                  className="flex items-center gap-2 px-2 py-1 text-2xs"
                >
                  <span className="tnum w-5 shrink-0 text-text-subtle">{p.seq}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-mono">{p.billNo}</span>
                    <span className="ml-1 text-text-muted">
                      {p.method.toUpperCase()}
                      {p.customerName ? ` · ${p.customerName}` : ""}
                    </span>
                  </span>
                  <span className="tnum shrink-0 font-mono">
                    {formatPaise(p.amountPaise)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-2xs text-text-subtle">
              The variance above is cash only. Check these against the payment app.
            </p>
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

        {/* The prompt, not the record.
            A note logged here belongs to the branch and the day, not to
            this till session: one manager covers both stores by phone at
            closing time, and ZHB's counter shuts at a different hour
            from BOD's. Tying the note to the session would file half of
            them against the wrong branch.
            So this asks, and CounterNoteButton stores. Skippable on
            purpose -- a required field on the way out of the door gets
            answered with a full stop. */}
        <div className="rounded-control border border-dashed border-border px-3 py-2.5">
          <p className="text-2xs text-text-muted">
            Anything to log before closing? Stock someone asked for and we did
            not have, a customer detail missed, an order still pending.
          </p>
          <div className="mt-1.5">
            <CounterNoteButton locationId={locationId} />
          </div>
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

/**
 * A paper record of the counter closing.
 *
 * Everything on the screen disappears the moment the register closes,
 * and a slip is what gets signed and handed over with the cash bag. It
 * lists the non-cash payments individually rather than as a total: a
 * disputed UPI figure is settled by finding the bill, and a single
 * number cannot do that.
 */
function printClosing(
  result: Record<string, unknown>,
  payments: SessionPayment[],
  terminal: string,
) {
  const rupees = (p: number) =>
    `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  const v = Number(result.variance_paise ?? 0);

  const rows = payments
    .map(
      (p) =>
        `<tr><td>${p.seq}</td><td>${p.billNo}</td><td>${p.method.toUpperCase()}</td>` +
        `<td class="r">${rupees(p.amountPaise)}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Counter closing — ${terminal}</title>
<style>
  body{font:12px/1.45 ui-monospace,monospace;margin:0;padding:8mm}
  h1{font-size:14px;margin:0 0 2mm}
  table{width:100%;border-collapse:collapse;margin:2mm 0}
  td,th{padding:1mm 0;text-align:left;vertical-align:top}
  .r{text-align:right}
  .line{border-top:1px dashed #000;margin:2mm 0}
  .big{font-size:13px;font-weight:600}
</style></head><body>
<h1>Counter closing — ${terminal}</h1>
<div>${new Date().toLocaleString("en-IN")}</div>
<div class="line"></div>
<table>
  <tr><td>Opening float</td><td class="r">${rupees(Number(result.opening_paise ?? 0))}</td></tr>
  <tr><td>Expected in drawer</td><td class="r">${rupees(Number(result.expected_paise ?? 0))}</td></tr>
  <tr><td>Counted</td><td class="r">${rupees(Number(result.counted_paise ?? 0))}</td></tr>
  <tr class="big"><td>${v === 0 ? "Balanced" : v > 0 ? "Over by" : "Short by"}</td>
      <td class="r">${v === 0 ? "—" : rupees(Math.abs(v))}</td></tr>
</table>
<div class="line"></div>
<table>
  <tr><td>Bills</td><td class="r">${Number(result.bills ?? 0)}</td></tr>
  <tr class="big"><td>Sales</td><td class="r">${rupees(Number(result.sales_paise ?? 0))}</td></tr>
</table>
${
  payments.length > 0
    ? `<div class="line"></div>
<div class="big">Paid by phone and card</div>
<table><thead><tr><th>#</th><th>Bill</th><th>How</th><th class="r">Amount</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr class="big"><td colspan="3">Total</td>
<td class="r">${rupees(payments.reduce((n, p) => n + p.amountPaise, 0))}</td></tr></tfoot></table>
<div style="font-size:11px">The variance above is cash only.</div>`
    : ""
}
<div class="line"></div>
<div style="margin-top:8mm">Counted by ______________________</div>
<div style="margin-top:6mm">Received by _____________________</div>
</body></html>`;

  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}
