"use client";

import { useEffect, useState, useTransition } from "react";
import { recordPayment } from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { formatPaise, parseRupeesToPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";
import type { PaymentAccount, VendorBalanceRow, OpenBill } from "./queries";

/**
 * Records a payment and, optionally, sets it against specific bills.
 *
 * Allocation is optional by design. Paying an advance before goods ship
 * is normal in this trade, so the form allows money to go out without
 * naming a document, and shows the remainder as an advance rather than
 * pretending it must belong somewhere.
 */
export function PaymentForm({
  accounts,
  vendors,
  onDone,
}: {
  accounts: PaymentAccount[];
  vendors: VendorBalanceRow[];
  onDone?: () => void;
}) {
  const [vendorId, setVendorId] = useState("");
  const [amount, setAmount] = useState("");
  const [bills, setBills] = useState<OpenBill[]>([]);
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!vendorId) {
      setBills([]);
      setAlloc({});
      return;
    }
    let cancelled = false;
    fetch(`/api/open-bills?vendorId=${vendorId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((b) => !cancelled && setBills(b))
      .catch(() => !cancelled && setBills([]));
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  const amountPaise = parseRupeesToPaise(amount) ?? 0;
  const allocatedPaise = Object.values(alloc).reduce(
    (s, v) => s + (parseRupeesToPaise(v) ?? 0),
    0,
  );
  const advancePaise = amountPaise - allocatedPaise;

  const settleAll = () => {
    let remaining = amountPaise;
    const next: Record<string, string> = {};
    for (const b of bills) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, b.duePaise);
      next[b.inwardId] = (take / 100).toFixed(2);
      remaining -= take;
    }
    setAlloc(next);
  };

  const submit = () =>
    start(async () => {
      setError(null);
      if (amountPaise <= 0) {
        setError("Enter an amount like 5000 or 5000.50");
        return;
      }
      if (allocatedPaise > amountPaise) {
        setError("You have allocated more than the payment amount.");
        return;
      }

      const form = document.getElementById("payment-form") as HTMLFormElement | null;
      const fd = new FormData(form ?? undefined);

      const result = await recordPayment({
        vendorId,
        accountId: String(fd.get("accountId") ?? ""),
        amountPaise,
        paidOn: String(fd.get("paidOn") ?? ""),
        method: String(fd.get("method") ?? "bank_transfer"),
        reference: String(fd.get("reference") ?? ""),
        note: String(fd.get("note") ?? ""),
        allocations: Object.entries(alloc)
          .map(([inward_id, v]) => ({
            inward_id,
            amount_paise: parseRupeesToPaise(v) ?? 0,
          }))
          .filter((a) => a.amount_paise > 0),
      });

      if (result.ok) {
        setAmount("");
        setAlloc({});
        setVendorId("");
        onDone?.();
      } else {
        setError(result.error);
      }
    });

  const selected = vendors.find((v) => v.vendorId === vendorId);

  return (
    <Card>
      <CardHeader>
        <h2 className="font-medium">Record a payment</h2>
      </CardHeader>
      <CardBody>
        <form id="payment-form" className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="vendorId">Vendor</Label>
              <Select
                id="vendorId"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                required
              >
                <option value="">Choose vendor</option>
                {vendors.map((v) => (
                  <option key={v.vendorId} value={v.vendorId}>
                    {v.vendorName}
                    {v.duePaise > 0 ? ` — ${formatPaise(v.duePaise)} due` : ""}
                  </option>
                ))}
              </Select>
              {selected && selected.advancePaise > 0 && (
                <p className="mt-1 text-2xs text-status-approved-fg">
                  {formatPaise(selected.advancePaise)} already sitting as advance.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="accountId">Paid from</Label>
              <Select id="accountId" name="accountId" required>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {formatPaise(a.balancePaise)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="tnum text-right"
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="paidOn">Date</Label>
              <Input
                id="paidOn"
                name="paidOn"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </div>
            <div>
              <Label htmlFor="method">Method</Label>
              <Select id="method" name="method" defaultValue="bank_transfer">
                <option value="bank_transfer">Bank transfer</option>
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="reference">Reference</Label>
              <Input id="reference" name="reference" placeholder="UTR / cheque no." />
            </div>
          </div>

          {bills.length > 0 && (
            <div className="rounded-card border border-border">
              <div className="flex items-center justify-between border-b border-border bg-surface-sunken px-3 py-2">
                <span className="text-sm font-medium">Set against bills</span>
                <Button type="button" size="sm" variant="ghost" onClick={settleAll}>
                  Fill oldest first
                </Button>
              </div>
              <div className="divide-y divide-border">
                {bills.map((b) => (
                  <div key={b.inwardId} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-2xs">{b.docNo}</span>
                      <span className="ml-2 text-2xs text-text-muted">
                        {b.invoiceNo ?? "no bill no."} · {formatDate(b.invoiceDate)}
                      </span>
                      <p className="text-2xs text-text-subtle">
                        {formatPaise(b.duePaise)} due of {formatPaise(b.totalPaise)}
                      </p>
                    </div>
                    <Input
                      inputMode="decimal"
                      placeholder="0.00"
                      value={alloc[b.inwardId] ?? ""}
                      onChange={(e) =>
                        setAlloc((p) => ({ ...p, [b.inwardId]: e.target.value }))
                      }
                      className="tnum w-28 text-right"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {amountPaise > 0 && (
            <div className="grid grid-cols-3 gap-3 rounded-control bg-surface-sunken px-3 py-2 text-2xs">
              <Sum label="Payment" value={formatPaise(amountPaise)} />
              <Sum label="Against bills" value={formatPaise(allocatedPaise)} />
              <Sum
                label={advancePaise < 0 ? "Over-allocated" : "Advance"}
                value={formatPaise(Math.abs(advancePaise))}
                bad={advancePaise < 0}
              />
            </div>
          )}

          <Input name="note" placeholder="Note (optional)" />

          {error && <FieldError>{error}</FieldError>}

          <div className="flex gap-2">
            <Button type="button" variant="primary" onClick={submit} disabled={pending}>
              {pending ? "Recording…" : "Record payment"}
            </Button>
            {onDone && (
              <Button type="button" variant="ghost" onClick={onDone}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function Sum({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div>
      <span className="block uppercase tracking-wide text-text-subtle">{label}</span>
      <span className={`tnum block font-semibold ${bad ? "text-status-danger-fg" : ""}`}>
        {value}
      </span>
    </div>
  );
}
