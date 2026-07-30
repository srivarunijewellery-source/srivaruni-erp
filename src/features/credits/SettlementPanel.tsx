"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FieldError } from "@/components/ui/Field";
import { formatPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { applyToBill, reverseMoneyDoc } from "./actions";
import type { Settlement } from "./settlement";

/**
 * Settle bills with a click.
 *
 * The amount is never typed. For any bill and any source the only sensible
 * figure is the smaller of what the source has left and what the bill
 * still owes, so that is what the button applies — and it says the number
 * on its face before you press it.
 */
export function SettlementPanel({
  vendorId,
  settlement,
}: {
  vendorId: string;
  settlement: Settlement;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(
    settlement.sources.find((s) => s.availablePaise > 0)?.id ?? null,
  );
  const [reversing, setReversing] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const source = settlement.sources.find((s) => s.id === picked) ?? null;
  const openBills = settlement.bills.filter((b) => b.balancePaise > 0);
  const available = settlement.sources.filter((s) => s.availablePaise > 0);

  function apply(inwardId: string, balancePaise: number) {
    if (!source) return;
    const amount = Math.min(source.availablePaise, balancePaise);
    setError(null);
    start(async () => {
      const res = await applyToBill(vendorId, source.kind, source.id, inwardId, amount);
      if (!res.ok) setError(res.error);
    });
  }

  function reverse(kind: "payment" | "credit", id: string) {
    setError(null);
    start(async () => {
      const res = await reverseMoneyDoc(vendorId, kind, id, reason);
      if (!res.ok) setError(res.error);
      else {
        setReversing(null);
        setReason("");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-medium">Settle bills</h2>
      </CardHeader>
      <CardBody className="space-y-4">
        <FieldError>{error}</FieldError>

        {/* Pick what to settle WITH, then click the bills to settle. */}
        <div>
          <p className="mb-1 text-2xs uppercase tracking-wide text-text-subtle">
            Settle using
          </p>
          {available.length === 0 ? (
            <p className="text-sm text-text-muted">
              Nothing unapplied. Record a payment or a credit note first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {available.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setPicked(s.id)}
                  className={
                    picked === s.id
                      ? "rounded-control border border-brand bg-brand-subtle px-2 py-1 text-sm text-brand"
                      : "rounded-control border border-border px-2 py-1 text-sm text-text-muted hover:border-brand hover:text-brand"
                  }
                >
                  <span className="font-medium">{s.label}</span>{" "}
                  <span className="tnum">{formatPaise(s.availablePaise)}</span>
                  <span className="ml-1 text-2xs opacity-70">
                    {s.kind === "credit" ? "credit" : "paid"} · {formatDate(s.dated)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-1 text-2xs uppercase tracking-wide text-text-subtle">
            Open bills
          </p>
          {openBills.length === 0 ? (
            <p className="text-sm text-text-muted">Every bill is settled.</p>
          ) : (
            <ul className="divide-y divide-border">
              {openBills.map((b) => {
                const amount = source ? Math.min(source.availablePaise, b.balancePaise) : 0;
                const clears = amount >= b.balancePaise;
                return (
                  <li key={b.inwardId} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="font-medium">{b.docNo}</p>
                      <p className="text-2xs text-text-muted">
                        <span className="tnum">{formatPaise(b.totalPaise)}</span> billed
                        {b.appliedPaise > 0 && (
                          <>
                            {" · "}
                            <span className="tnum">{formatPaise(b.appliedPaise)}</span> settled
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tnum text-sm font-medium text-status-danger-fg">
                        {formatPaise(b.balancePaise)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant={clears ? "primary" : "secondary"}
                        disabled={!source || pending || amount <= 0}
                        onClick={() => apply(b.inwardId, b.balancePaise)}
                      >
                        {amount <= 0
                          ? "Apply"
                          : clears
                            ? `Apply ${formatPaise(amount)} — clears it`
                            : `Apply ${formatPaise(amount)}`}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Reversal lives here because this is where you can see what a
            document is currently settling. */}
        {settlement.sources.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="mb-1 text-2xs uppercase tracking-wide text-text-subtle">
              Recorded payments and credits
            </p>
            <ul className="divide-y divide-border text-sm">
              {settlement.sources.map((s) => (
                <li key={s.id} className="py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      <span className="font-medium">{s.label}</span>{" "}
                      <span className="text-2xs text-text-muted">
                        {formatDate(s.dated)} · {formatPaise(s.amountPaise)}
                        {s.availablePaise > 0 && (
                          <> · {formatPaise(s.availablePaise)} unapplied</>
                        )}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setReversing(reversing === s.id ? null : s.id)}
                      className="text-2xs text-text-muted underline decoration-dotted underline-offset-2 hover:text-status-danger-fg"
                    >
                      Reverse
                    </button>
                  </div>
                  {reversing === s.id && (
                    <div className="mt-2 space-y-2 rounded-control border border-border p-2">
                      <p className="text-2xs text-text-muted">
                        Reversing releases everything this settled and cannot be undone —
                        record a fresh entry instead. Nothing older than 180 days can be
                        reversed.
                      </p>
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Reason (required)"
                        className="w-full rounded-control border border-border bg-surface px-2 py-1 text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button" size="sm" variant="secondary"
                          onClick={() => { setReversing(null); setReason(""); }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button" size="sm" disabled={pending || !reason.trim()}
                          onClick={() => reverse(s.kind, s.id)}
                        >
                          Reverse it
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
