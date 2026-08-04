"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { formatPaise } from "@/lib/money";

interface Tender {
  method: string;
  rupees: string;
  reference: string;
}

const METHODS = [
  { key: "cash", label: "Cash" },
  { key: "upi", label: "UPI" },
  { key: "card", label: "Card" },
  { key: "bank", label: "Bank" },
  { key: "cheque", label: "Cheque" },
] as const;

/**
 * Split tender.
 *
 * Half cash half UPI is ordinary at a jewellery counter, so this starts
 * with one row pre-filled to the full amount — the common case is one
 * tap — and adding a row splits the remainder rather than making anyone
 * do the subtraction.
 */
export function PaymentPanel({
  totalPaise,
  pending,
  onCancel,
  onConfirm,
}: {
  totalPaise: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (payments: Array<{ method: string; amount_paise: number; reference?: string }>) => void;
}) {
  const [tenders, setTenders] = useState<Tender[]>([
    { method: "cash", rupees: (totalPaise / 100).toFixed(2), reference: "" },
  ]);

  const paidPaise = useMemo(
    () => tenders.reduce((s, t) => s + Math.round((Number(t.rupees) || 0) * 100), 0),
    [tenders],
  );

  const remaining = totalPaise - paidPaise;
  const exact = remaining === 0;

  function set(i: number, patch: Partial<Tender>) {
    setTenders((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  function addRow() {
    // Pre-fill with what is still owed, so splitting is one tap.
    const left = Math.max(0, remaining);
    setTenders((prev) => [
      ...prev,
      { method: "upi", rupees: (left / 100).toFixed(2), reference: "" },
    ]);
  }

  return (
    <Modal title="Payment" onClose={onCancel} width="max-w-lg">
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-text-muted">Total</span>
          <span className="font-mono text-2xl">{formatPaise(totalPaise)}</span>
        </div>

        <ul className="space-y-2">
          {tenders.map((t, i) => (
            <li key={i} className="space-y-2 rounded-control border border-border p-2.5">
              <div className="flex flex-wrap gap-1.5">
                {METHODS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => set(i, { method: m.key })}
                    className={`rounded-control px-3 py-1.5 text-sm transition-colors ${
                      t.method === m.key
                        ? "bg-brand text-brand-fg"
                        : "border border-border hover:bg-surface-sunken"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label htmlFor={`amt-${i}`}>Amount ₹</Label>
                  <Input
                    id={`amt-${i}`}
                    type="number"
                    step="0.01"
                    min={0}
                    value={t.rupees}
                    onChange={(e) => set(i, { rupees: e.target.value })}
                    className="w-36 font-mono"
                  />
                </div>
                {t.method !== "cash" && (
                  <div className="min-w-40 flex-1">
                    <Label htmlFor={`ref-${i}`}>Reference</Label>
                    <Input
                      id={`ref-${i}`}
                      value={t.reference}
                      onChange={(e) => set(i, { reference: e.target.value })}
                      placeholder={t.method === "upi" ? "UPI ref" : "Last 4 digits"}
                    />
                  </div>
                )}
                {tenders.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setTenders((p) => p.filter((_, idx) => idx !== i))}
                  >
                    ×
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="secondary" onClick={addRow}>
            Split payment
          </Button>
          <span
            className={`font-mono text-sm ${
              exact
                ? "text-status-done-fg"
                : remaining > 0
                  ? "text-status-pending-fg"
                  : "text-status-danger-fg"
            }`}
          >
            {exact
              ? "Exact"
              : remaining > 0
                ? `${formatPaise(remaining)} still to pay`
                : `${formatPaise(-remaining)} over`}
          </span>
        </div>

        <p className="text-2xs text-text-muted">
          The payments have to add up to the bill exactly. A short or over tender is a
          counting slip, and letting it through means the drawer will not reconcile at
          close.
        </p>

        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={!exact || pending}
            onClick={() =>
              onConfirm(
                tenders
                  .filter((t) => (Number(t.rupees) || 0) > 0)
                  .map((t) => ({
                    method: t.method,
                    amount_paise: Math.round(Number(t.rupees) * 100),
                    reference: t.reference || undefined,
                  })),
              )
            }
          >
            {pending ? "Completing…" : "Complete sale"}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Back
          </Button>
        </div>
      </div>
    </Modal>
  );
}
