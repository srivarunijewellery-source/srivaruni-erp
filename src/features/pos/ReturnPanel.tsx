"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { formatPaise } from "@/lib/money";
import {
  fetchBillForReturn,
  fetchSessionBills,
  recordSalesReturn,
  type ReturnableLine,
} from "./actions";
import type { SessionBill } from "./queries";
import { findBillsForReturn, type ReturnableBill } from "./actions";
import { formatDate } from "@/lib/format";

interface Picked {
  qty: number;
  restock: boolean;
}

/**
 * Taking a piece back.
 *
 * A return is not a negative sale: the money does not come back out of
 * the drawer, it becomes a credit note the customer spends next time. So
 * this produces a credit note, puts saleable pieces back on the shelf,
 * and leaves the original bill untouched — the bill is what happened,
 * and rewriting history to make a return tidy is how audit trails rot.
 *
 * The refund is what was actually CHARGED for the piece, not its tag
 * price: a line that carried a share of a bill discount comes back at
 * the discounted figure, or every return on a discounted bill is a small
 * loss.
 */
export function ReturnPanel({
  sessionId,
  locationId,
  onClose,
  onDone,
}: {
  sessionId: string;
  /** Scopes the all-bills search to this branch. */
  locationId: string;
  onClose: () => void;
  onDone?: (msg: string) => void;
}) {
  const [pending, start] = useTransition();
  const [bills, setBills] = useState<SessionBill[]>([]);
  /** Bills found by searching the whole history, not just this session. */
  const [found, setFound] = useState<ReturnableBill[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [bill, setBill] = useState<SessionBill | null>(null);
  const [lines, setLines] = useState<ReturnableLine[] | null>(null);
  const [picked, setPicked] = useState<Record<string, Picked>>({});
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    returnNo: string;
    creditNoteNo: string;
    amountPaise: number;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await fetchSessionBills(sessionId);
      if (r.ok) setBills(r.data.filter((b) => b.status === "final"));
    })();
  }, [sessionId]);

  function open(b: SessionBill) {
    setBill(b);
    setLines(null);
    setPicked({});
    setError(null);
    start(async () => {
      const r = await fetchBillForReturn(b.billId);
      if (r.ok) setLines(r.data);
      else setError(r.error);
    });
  }

  const total = (lines ?? []).reduce((sum, l) => {
    const p = picked[l.billLineId];
    return sum + (p ? p.qty * l.unitPricePaise : 0);
  }, 0);

  const anyPicked = Object.values(picked).some((p) => p.qty > 0);

  function submit() {
    if (!bill) return;
    start(async () => {
      setError(null);
      const payload = (lines ?? [])
        .filter((l) => (picked[l.billLineId]?.qty ?? 0) > 0)
        .map((l) => ({
          bill_line_id: l.billLineId,
          item_id: l.itemId,
          qty: picked[l.billLineId]!.qty,
          restock: picked[l.billLineId]!.restock,
          reason: reason || null,
        }));

      const r = await recordSalesReturn(
        bill.billId,
        payload,
        reason || null,
        note || null,
        sessionId,
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDone(r.data);
      onDone?.(`${r.data.returnNo} · credit ${r.data.creditNoteNo}`);
    });
  }

  if (done) {
    return (
      <Modal title="Return taken" onClose={onClose} width="max-w-lg">
        <div className="space-y-3">
          <div className="rounded-control bg-status-done-bg px-3 py-3 text-status-done-fg">
            <p className="text-2xs font-medium uppercase tracking-widest">
              Credit note {done.creditNoteNo}
            </p>
            <p className="tnum font-mono text-3xl font-medium">
              {formatPaise(done.amountPaise)}
            </p>
          </div>
          <p className="text-sm text-text-muted">
            Recorded as {done.returnNo}. The credit sits against the customer and can be
            spent on any future bill — tell them it does not expire for a year. Saleable
            pieces are already back in stock.
          </p>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={bill ? `Return against ${bill.billNo}` : "Take a return"}
      onClose={onClose}
      width="max-w-2xl"
    >
      <div className="space-y-3">
        {!bill ? (
          <>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Bill number, name or phone"
              autoFocus
            />
            {/* Anything typed here searches every bill ever rung, not
                just this session. A return is normally days later, so
                restricting it to today made the common case impossible. */}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={searching || q.trim().length < 3}
                onClick={() => {
                  setSearching(true);
                  void (async () => {
                    const r = await findBillsForReturn(q, locationId);
                    setFound(r.ok ? r.data : []);
                    setSearching(false);
                  })();
                }}
              >
                {searching ? "Looking…" : "Search all bills"}
              </Button>
              {found && (
                <Button variant="ghost" onClick={() => setFound(null)}>
                  Back to this counter
                </Button>
              )}
            </div>

            {found ? (
              found.length === 0 ? (
                <p className="py-6 text-center text-sm text-text-muted">
                  No bill matches that. Try the bill number, or the customer&rsquo;s
                  phone.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-card border border-border">
                  {found.map((b) => (
                    <li key={b.billId}>
                      <button
                        type="button"
                        disabled={!b.returnable}
                        onClick={() =>
                          open({
                            billId: b.billId,
                            billNo: b.billNo,
                            customerName: b.customerName,
                            customerPhone: b.customerPhone,
                            soldByName: b.soldByName,
                            items: b.items,
                            totalPaise: b.totalPaise,
                            rungAt: b.billDate,
                            status: "final",
                            paymentMode: null,
                          } as SessionBill)
                        }
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-sm font-medium">
                            {b.billNo}
                          </span>
                          <span className="block truncate text-2xs text-text-muted">
                            {formatDate(b.billDate)} · {b.customerName ?? "no customer"} ·{" "}
                            {b.items} item{b.items === 1 ? "" : "s"}
                            {b.returnedQty > 0 && ` · ${b.returnedQty} already returned`}
                            {!b.returnable && " · nothing left to return"}
                          </span>
                        </span>
                        <span className="tnum shrink-0 font-mono text-sm">
                          {formatPaise(b.totalPaise)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : bills.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-muted">
                Nothing rung on this counter yet. Type a bill number or phone above and
                search all bills.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-card border border-border">
                {bills
                  .filter(
                    (b) =>
                      !q.trim() ||
                      b.billNo.toLowerCase().includes(q.trim().toLowerCase()) ||
                      b.customerName?.toLowerCase().includes(q.trim().toLowerCase()) ||
                      b.customerPhone?.includes(q.trim()),
                  )
                  .map((b) => (
                    <li key={b.billId}>
                      <button
                        type="button"
                        onClick={() => open(b)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-sunken"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-sm font-medium">
                            {b.billNo}
                          </span>
                          <span className="block truncate text-2xs text-text-muted">
                            {b.customerName ?? "no customer"} · {b.items} item
                            {b.items === 1 ? "" : "s"}
                          </span>
                        </span>
                        <span className="tnum font-mono text-sm">
                          {formatPaise(b.totalPaise)}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </>
        ) : !lines ? (
          <p className="py-6 text-center text-sm text-text-muted">Reading the bill…</p>
        ) : (
          <>
            {!bill.customerName && (
              <p className="rounded-control bg-status-danger-bg px-3 py-2 text-2xs text-status-danger-fg">
                This bill has no customer on it, so there is nobody to hold the credit.
                A return cannot be taken against it.
              </p>
            )}

            <ul className="divide-y divide-border rounded-card border border-border">
              {lines.map((l) => {
                const p = picked[l.billLineId] ?? { qty: 0, restock: true };
                const max = l.returnableQty;
                return (
                  <li key={l.billLineId} className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {l.itemName}
                        </span>
                        <span className="block font-mono text-2xs text-text-subtle">
                          {l.barcode ?? "no tag"} · {formatPaise(l.unitPricePaise)} each
                          {l.returnedQty > 0 && ` · ${l.returnedQty} already back`}
                        </span>
                      </span>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="secondary"
                          className="w-10 px-0 text-lg"
                          disabled={p.qty <= 0}
                          onClick={() =>
                            setPicked((prev) => ({
                              ...prev,
                              [l.billLineId]: { ...p, qty: Math.max(0, p.qty - 1) },
                            }))
                          }
                        >
                          −
                        </Button>
                        <span className="tnum w-12 text-center font-mono text-base">
                          {p.qty}
                          <span className="text-2xs text-text-subtle">/{max}</span>
                        </span>
                        <Button
                          variant="secondary"
                          className="w-10 px-0 text-lg"
                          disabled={p.qty >= max}
                          onClick={() =>
                            setPicked((prev) => ({
                              ...prev,
                              [l.billLineId]: { ...p, qty: Math.min(max, p.qty + 1) },
                            }))
                          }
                        >
                          +
                        </Button>
                      </div>

                      <span className="tnum w-24 text-right font-mono text-sm">
                        {formatPaise(p.qty * l.unitPricePaise)}
                      </span>
                    </div>

                    {p.qty > 0 && (
                      <label className="mt-1.5 flex items-center gap-2 text-2xs text-text-muted">
                        <input
                          type="checkbox"
                          checked={!p.restock}
                          onChange={(e) =>
                            setPicked((prev) => ({
                              ...prev,
                              [l.billLineId]: { ...p, restock: !e.target.checked },
                            }))
                          }
                          className="size-3.5 accent-[var(--color-brand)]"
                        />
                        Damaged — credit the customer but keep it off the shelf
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="reason">Reason</Label>
                <Input
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="size, changed mind, faulty"
                />
              </div>
              <div>
                <Label htmlFor="rnote">Note</Label>
                <Input
                  id="rnote"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Anything worth recording"
                />
              </div>
            </div>

            {anyPicked && (
              <div className="flex items-baseline justify-between rounded-control bg-surface-sunken px-3 py-2.5">
                <span className="text-sm font-medium">Credit note for</span>
                <span className="tnum font-mono text-2xl">{formatPaise(total)}</span>
              </div>
            )}

            <FieldError>{error}</FieldError>

            <div className="flex gap-2">
              <Button
                variant="primary"
                disabled={!anyPicked || pending || !bill.customerName}
                onClick={submit}
              >
                {pending ? "Taking…" : "Take the return"}
              </Button>
              <Button variant="ghost" onClick={() => setBill(null)}>
                Pick another bill
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
