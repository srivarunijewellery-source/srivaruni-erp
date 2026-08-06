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

const OTHER_METHODS = [
  { key: "upi", label: "UPI" },
  { key: "card", label: "Card" },
  { key: "bank", label: "Bank" },
  { key: "cheque", label: "Cheque" },
] as const;

/** Notes people actually hand over. */
const QUICK = [500, 1000, 2000, 5000];

export interface PaymentResult {
  payments: Array<{ method: string; amount_paise: number; reference?: string }>;
  /** Credit notes to spend. Settled after the bill exists. */
  creditPaise: number;
  /** What to hand back. Recorded for the receipt, never as a payment. */
  changePaise: number;
}

/**
 * Cash first, because that is how the counter actually works.
 *
 * The old panel asked for the amount to RECORD, which is not the number
 * anyone at a till is holding: they are holding what the customer handed
 * over, and the thing they need back from the screen is the change. So
 * the cash box is what was tendered, the change falls out of it, and the
 * recorded cash payment is the part that belongs to the bill. Anything
 * the cash does not cover opens the other methods for the remainder.
 */
export function PaymentPanel({
  totalPaise,
  pending,
  creditAvailablePaise = 0,
  onCancel,
  onConfirm,
}: {
  totalPaise: number;
  pending: boolean;
  /** Credit notes this customer is holding, if any. */
  creditAvailablePaise?: number;
  onCancel: () => void;
  onConfirm: (result: PaymentResult) => void;
}) {
  const [useCredit, setUseCredit] = useState(false);
  const [tendered, setTendered] = useState("");
  const [others, setOthers] = useState<Tender[]>([]);

  const creditPaise = useCredit
    ? Math.min(creditAvailablePaise, totalPaise)
    : 0;

  // What still has to be paid for with money.
  const payablePaise = totalPaise - creditPaise;

  const tenderedPaise = Math.round((Number(tendered) || 0) * 100);
  const othersPaise = others.reduce(
    (s, t) => s + Math.round((Number(t.rupees) || 0) * 100),
    0,
  );

  // Cash only ever counts toward the bill up to what is owed. Hand over
  // 2000 for a 1650 bill and 1650 is the payment; the rest is change.
  const cashAppliedPaise = Math.min(tenderedPaise, Math.max(0, payablePaise - othersPaise));
  const changePaise = Math.max(0, tenderedPaise - cashAppliedPaise);
  const shortPaise = payablePaise - cashAppliedPaise - othersPaise;
  const settled = shortPaise === 0 && payablePaise >= 0;

  const payments = useMemo(() => {
    const out: Array<{ method: string; amount_paise: number; reference?: string }> = [];
    if (cashAppliedPaise > 0) out.push({ method: "cash", amount_paise: cashAppliedPaise });
    for (const t of others) {
      const paise = Math.round((Number(t.rupees) || 0) * 100);
      if (paise > 0) {
        out.push({
          method: t.method,
          amount_paise: paise,
          reference: t.reference || undefined,
        });
      }
    }
    return out;
  }, [cashAppliedPaise, others]);

  function addOther() {
    setOthers((prev) => [
      ...prev,
      {
        method: "upi",
        rupees: (Math.max(0, shortPaise) / 100).toFixed(2),
        reference: "",
      },
    ]);
  }

  return (
    <Modal title="Payment" onClose={onCancel} width="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-control bg-brand px-4 py-3 text-brand-fg">
          <span className="text-2xs font-medium uppercase tracking-widest opacity-80">
            To pay
          </span>
          <span className="tnum font-mono text-3xl leading-none font-medium">
            {formatPaise(totalPaise)}
          </span>
        </div>

        {creditAvailablePaise > 0 && (
          <label className="flex cursor-pointer items-center gap-2.5 rounded-control border border-border px-3 py-2.5 hover:bg-surface-sunken">
            <input
              type="checkbox"
              checked={useCredit}
              onChange={(e) => setUseCredit(e.target.checked)}
              className="size-4 accent-[var(--color-brand)]"
            />
            <span className="min-w-0 flex-1 text-sm">
              Use credit notes
              <span className="block text-2xs text-text-muted">
                {formatPaise(creditAvailablePaise)} available
                {useCredit && creditPaise < creditAvailablePaise
                  ? ` · ${formatPaise(creditPaise)} used on this bill`
                  : ""}
              </span>
            </span>
            {useCredit && (
              <span className="tnum shrink-0 font-mono text-sm text-status-done-fg">
                − {formatPaise(creditPaise)}
              </span>
            )}
          </label>
        )}

        {payablePaise > 0 ? (
          <>
            <div>
              <Label htmlFor="tendered">Cash tendered ₹</Label>
              <Input
                id="tendered"
                type="number"
                step="0.01"
                min={0}
                inputMode="decimal"
                autoFocus
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="h-12 w-full font-mono text-2xl"
                placeholder="0.00"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setTendered((payablePaise / 100).toFixed(2))}
                  className="rounded-control border border-border px-3 py-1.5 text-2xs hover:bg-surface-sunken"
                >
                  Exact {formatPaise(payablePaise)}
                </button>
                {QUICK.filter((r) => r * 100 >= payablePaise).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setTendered(r.toFixed(2))}
                    className="rounded-control border border-border px-3 py-1.5 text-2xs hover:bg-surface-sunken"
                  >
                    ₹{r}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setTendered("")}
                  className="rounded-control px-3 py-1.5 text-2xs text-text-muted hover:bg-surface-sunken"
                >
                  No cash
                </button>
              </div>
            </div>

            {/* The number the person at the till is waiting for. */}
            {changePaise > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-control bg-status-done-bg px-4 py-3 text-status-done-fg">
                <span className="text-2xs font-medium uppercase tracking-widest">
                  Change to return
                </span>
                <span className="tnum font-mono text-3xl leading-none font-medium">
                  {formatPaise(changePaise)}
                </span>
              </div>
            )}

            {shortPaise > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-status-pending-fg">
                  {formatPaise(shortPaise)} still to pay
                  {tenderedPaise > 0 ? " — take the rest another way." : "."}
                </p>

                {others.map((t, i) => (
                  <div
                    key={i}
                    className="space-y-2 rounded-control border border-border p-2.5"
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {OTHER_METHODS.map((m) => (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() =>
                            setOthers((p) =>
                              p.map((x, idx) =>
                                idx === i ? { ...x, method: m.key } : x,
                              ),
                            )
                          }
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
                          onChange={(e) =>
                            setOthers((p) =>
                              p.map((x, idx) =>
                                idx === i ? { ...x, rupees: e.target.value } : x,
                              ),
                            )
                          }
                          className="w-36 font-mono"
                        />
                      </div>
                      <div className="min-w-40 flex-1">
                        <Label htmlFor={`ref-${i}`}>Reference</Label>
                        <Input
                          id={`ref-${i}`}
                          value={t.reference}
                          onChange={(e) =>
                            setOthers((p) =>
                              p.map((x, idx) =>
                                idx === i ? { ...x, reference: e.target.value } : x,
                              ),
                            )
                          }
                          placeholder={t.method === "upi" ? "UPI ref" : "Last 4 digits"}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() => setOthers((p) => p.filter((_, idx) => idx !== i))}
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                ))}

                <Button size="sm" variant="secondary" onClick={addOther}>
                  {others.length === 0 ? "Card / UPI for the rest" : "Another method"}
                </Button>
              </div>
            )}

            {shortPaise < 0 && (
              <p className="text-sm text-status-danger-fg">
                {formatPaise(-shortPaise)} more than the bill has been taken by card or
                UPI. Reduce it — only cash can be over, because only cash gives change.
              </p>
            )}
          </>
        ) : (
          <p className="rounded-control bg-status-done-bg px-3 py-2.5 text-sm text-status-done-fg">
            The credit notes cover this bill in full. Nothing to collect.
          </p>
        )}

        <div className="flex gap-2">
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            disabled={!settled || pending}
            onClick={() => onConfirm({ payments, creditPaise, changePaise })}
          >
            {pending
              ? "Completing…"
              : changePaise > 0
                ? `Complete · return ${formatPaise(changePaise)}`
                : "Complete sale"}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Back
          </Button>
        </div>
      </div>
    </Modal>
  );
}
