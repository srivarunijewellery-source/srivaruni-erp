"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { recordExpense, reverseExpense } from "./actions";
import type { ExpenseRow, LedgerAccount, TaxRate } from "./queries";

const today = () => new Date().toISOString().slice(0, 10);

export function ExpenseManager({
  expenses,
  categories,
  taxRates,
  locations,
  paymentAccounts,
  vendors,
}: {
  expenses: ExpenseRow[];
  categories: LedgerAccount[];
  taxRates: TaxRate[];
  locations: Array<{ id: string; code: string; name: string }>;
  paymentAccounts: Array<{ id: string; name: string; kind: string }>;
  vendors: Array<{ id: string; name: string }>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [taxRateId, setTaxRateId] = useState("");
  const [unpaid, setUnpaid] = useState(false);
  const [reversing, setReversing] = useState<ExpenseRow | null>(null);

  // Shown live so the total is never a surprise after saving.
  const rate = taxRates.find((t) => t.id === taxRateId);
  const base = Number(amount) || 0;
  const tax = rate ? Math.round(base * rate.totalBps) / 10000 : 0;

  function submit(formData: FormData) {
    start(async () => {
      setError(null);
      const r = await recordExpense(formData);
      if (r.ok) {
        setOpen(false);
        setAmount("");
        setTaxRateId("");
      } else setError(r.error);
    });
  }

  function submitReversal(formData: FormData) {
    start(async () => {
      setError(null);
      const r = await reverseExpense(formData);
      if (r.ok) setReversing(null);
      else setError(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <span className="font-medium">
            {open ? "New expense" : `${expenses.length} recorded`}
          </span>
          <Button
            variant={open ? "ghost" : "primary"}
            onClick={() => {
              setOpen(!open);
              setError(null);
            }}
          >
            {open ? "Cancel" : "Record expense"}
          </Button>
        </CardHeader>

        {open && (
          <CardBody>
            <form action={submit} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="accountId">Category</Label>
                  <Select id="accountId" name="accountId" required defaultValue="">
                    <option value="" disabled>
                      Pick one
                    </option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="amountRupees">Amount (₹)</Label>
                  <Input
                    id="amountRupees"
                    name="amountRupees"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="expenseDate">Date</Label>
                  <Input
                    id="expenseDate"
                    name="expenseDate"
                    type="date"
                    defaultValue={today()}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="taxRateId">GST</Label>
                  <Select
                    id="taxRateId"
                    name="taxRateId"
                    value={taxRateId}
                    onChange={(e) => setTaxRateId(e.target.value)}
                  >
                    <option value="">No GST</option>
                    {taxRates
                      .filter((t) => t.active && t.totalBps > 0)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="locationId">Store</Label>
                  <Select id="locationId" name="locationId" defaultValue="">
                    <option value="">Not store-specific</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code} — {l.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="payee">Paid to</Label>
                  <Input id="payee" name="payee" placeholder="Landlord, courier, etc." />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <Label htmlFor="paidFromId">Paid from</Label>
                  <Select id="paidFromId" name="paidFromId" defaultValue="" disabled={unpaid}>
                    <option value="">Cash</option>
                    {paymentAccounts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="method">Method</Label>
                  <Input id="method" name="method" placeholder="UPI, NEFT, cash" disabled={unpaid} />
                </div>
                <div>
                  <Label htmlFor="reference">Reference</Label>
                  <Input id="reference" name="reference" placeholder="UTR / cheque no." />
                </div>
                <div>
                  <Label htmlFor="billRef">Bill number</Label>
                  <Input id="billRef" name="billRef" placeholder="Their invoice no." />
                </div>
              </div>

              {vendors.length > 0 && (
                <div>
                  <Label htmlFor="vendorId">Vendor (optional)</Label>
                  <Select id="vendorId" name="vendorId" defaultValue="">
                    <option value="">Not a registered vendor</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              <div>
                <Label htmlFor="note">Note</Label>
                <Input id="note" name="note" />
              </div>

              <div className="flex flex-wrap gap-5">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="itcEligible"
                    className="size-4 accent-brand"
                    disabled={!taxRateId}
                  />
                  Input credit claimable
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="unpaid"
                    checked={unpaid}
                    onChange={(e) => setUnpaid(e.target.checked)}
                    className="size-4 accent-brand"
                  />
                  Not paid yet
                </label>
              </div>

              <p className="text-2xs text-text-muted">
                Only tick input credit when you have a proper tax invoice showing our GSTIN.
                Without it the GST is part of the cost, not something you can reclaim.
                {unpaid && " An unpaid expense sits in payables until it is settled."}
              </p>

              {base > 0 && (
                <p className="text-sm">
                  <span className="text-text-muted">Total: </span>
                  <span className="font-mono font-medium">
                    {formatPaise(Math.round((base + tax) * 100))}
                  </span>
                  {tax > 0 && (
                    <span className="ml-2 text-2xs text-text-muted">
                      ({formatPaise(Math.round(base * 100))} + {formatPaise(Math.round(tax * 100))}{" "}
                      GST)
                    </span>
                  )}
                </p>
              )}

              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Record and post"}
              </Button>
            </form>
          </CardBody>
        )}
      </Card>

      <FieldError>{error}</FieldError>

      {reversing && (
        <Card>
          <CardHeader className="font-medium">Reverse {reversing.expenseNo}</CardHeader>
          <CardBody>
            <form action={submitReversal} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={reversing.id} />
              <div className="flex-1">
                <Label htmlFor="reason">Reason</Label>
                <Input id="reason" name="reason" required placeholder="Why is this being undone?" />
              </div>
              <Button type="submit" variant="danger" disabled={pending}>
                {pending ? "Reversing…" : "Reverse"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setReversing(null)}>
                Cancel
              </Button>
            </form>
            <p className="mt-2 text-2xs text-text-muted">
              The expense stays on the books and a mirror-image entry is posted against it.
              Nothing is deleted.
            </p>
          </CardBody>
        </Card>
      )}

      {expenses.length === 0 ? (
        <EmptyState
          title="No expenses recorded"
          hint="Rent, electricity, salaries, courier — everything the business spends that is not stock."
        />
      ) : (
        <Card>
          <CardBody className="p-0">
            <ul className="divide-y divide-border">
              {expenses.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{e.accountName}</span>
                      {e.status === "reversed" && <Badge tone="danger">Reversed</Badge>}
                      {e.status === "unpaid" && <Badge tone="pending">Unpaid</Badge>}
                      {e.itcEligible && <Badge tone="neutral">ITC</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-2xs text-text-muted">
                      {[
                        e.expenseNo,
                        formatDate(e.expenseDate),
                        e.payee,
                        e.locationCode,
                        e.method,
                        e.billRef,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-mono text-sm">{formatPaise(e.totalPaise)}</p>
                    {e.taxPaise > 0 && (
                      <p className="text-2xs text-text-muted">
                        incl {formatPaise(e.taxPaise)} GST
                      </p>
                    )}
                  </div>

                  {e.status !== "reversed" && (
                    <Button size="sm" variant="ghost" onClick={() => setReversing(e)}>
                      Reverse
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
