"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { formatPaise } from "@/lib/money";
import { fetchCashMovements, fetchDrawer, recordCashMovement } from "./actions";
import type { CashMovement, Drawer, ExpenseAccount } from "./queries";

type Kind = "pay_in" | "pay_out" | "expense";

const KIND_LABEL: Record<Kind, string> = {
  pay_in: "Put money in",
  pay_out: "Take money out",
  expense: "Spend on something",
};

const KIND_HINT: Record<Kind, string> = {
  pay_in: "Change brought from the safe, or a float top-up. Not a sale.",
  pay_out: "Cash lifted out to bank or to the safe. Still ours, just not here.",
  expense: "Tea, an auto, a bulb. Real money spent, so it goes in the books.",
};

/**
 * Everything that moves cash without being a sale.
 *
 * The drawer and the day's takings are two different numbers and the
 * counter kept conflating them: change gets added, notes get lifted out
 * to bank, and someone buys packing tape out of the till. None of that
 * is revenue, all of it changes what should be sitting in the drawer at
 * close, and until now none of it could be recorded — so every close
 * produced a variance that was really just bookkeeping.
 */
export function DrawerPanel({
  sessionId,
  expenseAccounts,
  onClose,
  onChanged,
}: {
  sessionId: string;
  expenseAccounts: ExpenseAccount[];
  onClose: () => void;
  onChanged?: (drawer: Drawer) => void;
}) {
  const [pending, start] = useTransition();
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [account, setAccount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = () =>
    void (async () => {
      const [d, m] = await Promise.all([
        fetchDrawer(sessionId),
        fetchCashMovements(sessionId),
      ]);
      if (d.ok) {
        setDrawer(d.data);
        onChanged?.(d.data);
      }
      if (m.ok) setMovements(m.data);
    })();

  useEffect(reload, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit() {
    const paise = Math.round((Number(amount) || 0) * 100);
    if (paise <= 0) {
      setError("Enter an amount.");
      return;
    }
    if (kind === "expense" && !reason.trim()) {
      setError("Say what the money went on. A blank line here is a hole in the books.");
      return;
    }

    start(async () => {
      setError(null);
      setNotice(null);
      const r = await recordCashMovement(
        sessionId,
        kind,
        paise,
        reason.trim() || null,
        kind === "expense" ? account || null : null,
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setAmount("");
      setReason("");
      setNotice(
        kind === "pay_in"
          ? "Added to the drawer."
          : kind === "pay_out"
            ? "Taken out of the drawer."
            : "Recorded, and posted to the books.",
      );
      reload();
    });
  }

  return (
    <Modal title="Drawer" onClose={onClose} width="max-w-2xl">
      <div className="space-y-4">
        <div className="rounded-card border border-border bg-surface-sunken p-3">
          {!drawer ? (
            <p className="text-sm text-text-muted">Reading the drawer...</p>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-2xs font-medium uppercase tracking-wide text-text-muted">
                  In the drawer now
                </span>
                <span className="tnum font-mono text-2xl">
                  {formatPaise(drawer.expectedPaise)}
                </span>
              </div>
              <p className="mt-1 text-2xs text-text-subtle">
                float {formatPaise(drawer.openingFloatPaise)} + cash{" "}
                {formatPaise(drawer.cashSalesPaise)}
                {drawer.payInPaise > 0 && ` + in ${formatPaise(drawer.payInPaise)}`}
                {drawer.payOutPaise > 0 && ` - out ${formatPaise(drawer.payOutPaise)}`}
                {drawer.expensePaise > 0 && ` - spent ${formatPaise(drawer.expensePaise)}`}
              </p>
            </>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setError(null);
              }}
              className={`rounded-control border px-3 py-2 text-left text-sm transition-colors ${
                kind === k
                  ? "border-brand bg-brand-subtle font-medium text-brand"
                  : "border-border hover:bg-surface-sunken"
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <p className="text-2xs text-text-muted">{KIND_HINT[kind]}</p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="amt">Amount &#8377;</Label>
            <Input
              id="amt"
              type="number"
              min={0}
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-36 font-mono"
              autoFocus
            />
          </div>

          {kind === "expense" && (
            <div className="min-w-48 flex-1">
              <Label htmlFor="acct">Category</Label>
              <Select
                id="acct"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
              >
                <option value="">Miscellaneous</option>
                {expenseAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="min-w-48 flex-1">
            <Label htmlFor="why">
              {kind === "expense" ? "What for" : "Reason"}
            </Label>
            <Input
              id="why"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                kind === "pay_in"
                  ? "change from the safe"
                  : kind === "pay_out"
                    ? "banked at lunch"
                    : "tea for the shop"
              }
            />
          </div>

          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? "Saving..." : "Record"}
          </Button>
        </div>

        <FieldError>{error}</FieldError>
        {notice && <p className="text-sm text-status-done-fg">{notice}</p>}

        {movements.length > 0 && (
          <div>
            <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-text-muted">
              Today on this counter
            </p>
            <ul className="divide-y divide-border rounded-card border border-border">
              {movements.map((m) => (
                <li key={m.id} className="flex items-baseline gap-3 px-3 py-2 text-sm">
                  <span
                    className={`w-16 shrink-0 text-2xs uppercase tracking-wide ${
                      m.kind === "pay_in"
                        ? "text-status-done-fg"
                        : "text-status-danger-fg"
                    }`}
                  >
                    {m.kind === "pay_in" ? "in" : m.kind === "pay_out" ? "out" : "spent"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {m.reason ?? m.accountName ?? "—"}
                    {m.accountName && m.reason && (
                      <span className="ml-2 text-2xs text-text-subtle">
                        {m.accountName}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-2xs text-text-subtle">{m.staffName}</span>
                  <span className="tnum shrink-0 font-mono">
                    {m.kind === "pay_in" ? "+" : "-"} {formatPaise(m.amountPaise)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Movements are append-only. A mistake is corrected with an
            opposite entry, which leaves both visible — the same rule the
            stock ledger and the money history already follow. */}
        <p className="text-2xs text-text-subtle">
          Nothing here can be edited or deleted. Got one wrong? Record the opposite and say
          why.
        </p>
      </div>
    </Modal>
  );
}
