"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { formatPaise } from "@/lib/money";
import {
  editBill,
  setBillCustomer,
  setBillPayments,
  setBillSalesman,
} from "./actions";
import { searchCustomersAction } from "./customer-actions";
import { fetchBillForReturn, searchCatalog } from "./actions";
import type { CustomerHit, PosCatalogItem, Seller, SessionBill } from "./queries";

type Mode = "menu" | "salesman" | "payment" | "customer" | "edit";

const METHODS = ["cash", "upi", "card", "bank", "cheque"] as const;

/**
 * What can be corrected about a bill without reprinting the world.
 *
 * Three of these four leave the total alone, so they amend the bill in
 * place. Editing the lines does not: it cancels and reissues, and tells
 * the owner. That difference is the whole design — a mistyped salesman
 * should not burn an invoice number, and a changed price should not pass
 * unnoticed.
 */
export function BillActions({
  bill,
  sellers,
  locationId,
  onDone,
  onClose,
}: {
  bill: SessionBill;
  sellers: Seller[];
  /** Needed to search the catalogue when adding a piece to the bill. */
  locationId: string;
  onDone: (message: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("menu");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [staffId, setStaffId] = useState("");
  const [method, setMethod] = useState<string>("cash");
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);

  /**
   * The bill being rebuilt.
   *
   * Editing used to only let quantities go down, which covers "rang two
   * instead of one" and nothing else. A bill can be wrong in every
   * direction -- wrong price, missing piece, item that was never handed
   * over -- so while the register is open the whole invoice is editable.
   */
  type EditLine = {
    key: string;
    itemId: string;
    name: string;
    barcode: string | null;
    qty: number;
    unitPaise: number;
    soldBy: string | null;
  };
  const [lines, setLines] = useState<EditLine[] | null>(null);
  const [reason, setReason] = useState("");
  const [confirmEdit, setConfirmEdit] = useState(false);
  const [addQ, setAddQ] = useState("");
  const [addHits, setAddHits] = useState<PosCatalogItem[]>([]);
  const [payMethod, setPayMethod] = useState("cash");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) onDone(msg);
      else setError(r.error ?? "That did not work.");
    });

  function openEdit() {
    setMode("edit");
    start(async () => {
      const r = await fetchBillForReturn(bill.billId);
      if (r.ok) {
        setLines(
          r.data.map((l) => ({
            key: l.billLineId,
            itemId: l.itemId,
            name: l.itemName,
            barcode: l.barcode,
            qty: l.qty,
            unitPaise: l.unitPricePaise,
            soldBy: null,
          })),
        );
        setPayMethod(bill.paymentMode ?? "cash");
      } else setError(r.error);
    });
  }

  function addItem(i: PosCatalogItem) {
    setLines((prev) => [
      ...(prev ?? []),
      {
        key: `new-${i.item_id}-${Date.now()}`,
        itemId: i.item_id,
        name: i.name,
        barcode: i.barcode,
        qty: 1,
        unitPaise: i.price_paise,
        soldBy: null,
      },
    ]);
    setAddQ("");
    setAddHits([]);
  }

  const newTotal = (lines ?? []).reduce((s, l) => s + l.qty * l.unitPaise, 0);

  return (
    <Modal
      title={mode === "menu" ? bill.billNo : `${bill.billNo} — ${mode}`}
      onClose={onClose}
      width="max-w-xl"
    >
      <div className="space-y-3">
        <p className="text-2xs text-text-muted">
          {formatPaise(bill.totalPaise)} · {bill.items} item
          {bill.items === 1 ? "" : "s"}
          {bill.customerName ? ` · ${bill.customerName}` : " · walk-in"}
          {bill.soldByName ? ` · ${bill.soldByName}` : ""}
        </p>

        <FieldError>{error}</FieldError>

        {mode === "menu" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Action
              label="Change salesman"
              hint="Invoice or a single line"
              onClick={() => setMode("salesman")}
            />
            <Action
              label="Change payment"
              hint="Cash, UPI, card, bank"
              onClick={() => setMode("payment")}
            />
            <Action
              label="Change customer"
              hint="Attach or swap the buyer"
              onClick={() => setMode("customer")}
            />
            <Action
              label="Edit invoice"
              hint="Changes the total · owner is emailed"
              danger
              onClick={openEdit}
            />
          </div>
        )}

        {mode === "salesman" && (
          <div className="space-y-2">
            <Label htmlFor="sm">Whole invoice goes to</Label>
            <Select id="sm" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Choose…</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <p className="text-2xs text-text-muted">
              Lines already given to someone else keep their own salesman.
            </p>
            <Row
              onBack={() => setMode("menu")}
              disabled={!staffId || pending}
              onGo={() =>
                run(
                  () => setBillSalesman(bill.billId, staffId),
                  `${bill.billNo} reassigned.`,
                )
              }
            />
          </div>
        )}

        {mode === "payment" && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`rounded-control px-3 py-1.5 text-sm capitalize ${
                    method === m
                      ? "bg-brand text-brand-fg"
                      : "border border-border hover:bg-surface-sunken"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div>
              <Label htmlFor="ref">Reference</Label>
              <Input
                id="ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={method === "upi" ? "UPI ref" : "Last 4 digits"}
              />
            </div>
            <p className="text-2xs text-text-muted">
              The whole {formatPaise(bill.totalPaise)} moves to {method}. The drawer
              corrects itself — a sale keyed as cash that was really UPI leaves the till
              short at close.
            </p>
            <Row
              onBack={() => setMode("menu")}
              disabled={pending}
              onGo={() =>
                run(
                  () =>
                    setBillPayments(bill.billId, [
                      {
                        method,
                        amount_paise: bill.totalPaise,
                        reference: reference || undefined,
                      },
                    ]),
                  `${bill.billNo} is now ${method}.`,
                )
              }
            />
          </div>
        )}

        {mode === "customer" && (
          <div className="space-y-2">
            <Label htmlFor="ph">Phone</Label>
            <div className="flex gap-2">
              <Input
                id="ph"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10 digits"
              />
              <Button
                variant="secondary"
                disabled={pending || phone.trim().length < 3}
                onClick={() =>
                  start(async () => {
                    const r = await searchCustomersAction(phone.trim());
                    if (r.ok) setHits(r.data);
                    else setError(r.error);
                  })
                }
              >
                Find
              </Button>
            </div>
            <ul className="divide-y divide-border rounded-card border border-border">
              {hits.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-surface-sunken"
                    onClick={() =>
                      run(
                        () => setBillCustomer(bill.billId, c.id),
                        `${bill.billNo} is now ${c.name ?? c.phone}'s.`,
                      )
                    }
                  >
                    {c.name ?? "Unnamed"}
                    <span className="ml-2 font-mono text-2xs text-text-muted">
                      {c.phone}
                    </span>
                  </button>
                </li>
              ))}
              {hits.length === 0 && (
                <li className="px-3 py-2 text-2xs text-text-subtle">
                  Search to pick a customer.
                </li>
              )}
            </ul>
            <Row onBack={() => setMode("menu")} hideGo />
          </div>
        )}

        {mode === "edit" && (
          <div className="space-y-2">
            {!lines ? (
              <p className="py-6 text-center text-sm text-text-muted">Reading the bill…</p>
            ) : (
              <>
                <ul className="max-h-64 divide-y divide-border overflow-auto rounded-card border border-border">
                  {lines.map((l, i) => (
                    <li key={l.key} className="space-y-1 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{l.name}</span>
                          <span className="block font-mono text-2xs text-text-subtle">
                            {l.barcode ?? "no tag"}
                          </span>
                        </span>

                        <Input
                          type="number"
                          min={0}
                          aria-label="Quantity"
                          value={l.qty}
                          onChange={(e) =>
                            setLines((p) =>
                              (p ?? []).map((x, idx) =>
                                idx === i
                                  ? { ...x, qty: Math.max(0, Number(e.target.value) || 0) }
                                  : x,
                              ),
                            )
                          }
                          className="h-8 w-14 text-right font-mono text-sm"
                        />
                        <span className="text-2xs text-text-subtle">×</span>
                        {/* Price is editable too: a piece rung at the
                            wrong tag price is as common as a wrong
                            quantity, and refusing to fix it here would
                            send someone to a return instead. */}
                        <Input
                          type="number"
                          min={0}
                          aria-label="Price"
                          value={(l.unitPaise / 100).toString()}
                          onChange={(e) =>
                            setLines((p) =>
                              (p ?? []).map((x, idx) =>
                                idx === i
                                  ? {
                                      ...x,
                                      unitPaise: Math.round(
                                        (Number(e.target.value) || 0) * 100,
                                      ),
                                    }
                                  : x,
                              ),
                            )
                          }
                          className="h-8 w-20 text-right font-mono text-sm"
                        />

                        <button
                          type="button"
                          aria-label={`Remove ${l.name}`}
                          onClick={() =>
                            setLines((p) => (p ?? []).filter((_, idx) => idx !== i))
                          }
                          className="shrink-0 px-1 text-text-subtle hover:text-status-danger-fg"
                        >
                          ×
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-2xs text-text-subtle">Sold by</span>
                        <Select
                          value={l.soldBy ?? ""}
                          onChange={(e) =>
                            setLines((p) =>
                              (p ?? []).map((x, idx) =>
                                idx === i ? { ...x, soldBy: e.target.value || null } : x,
                              ),
                            )
                          }
                          className="h-7 w-44 py-0 text-2xs"
                        >
                          <option value="">Whoever is on the bill</option>
                          {sellers.map((sp) => (
                            <option key={sp.id} value={sp.id}>
                              {sp.name}
                            </option>
                          ))}
                        </Select>
                        <span className="tnum ml-auto font-mono text-2xs">
                          {formatPaise(l.qty * l.unitPaise)}
                        </span>
                      </div>
                    </li>
                  ))}
                  {lines.length === 0 && (
                    <li className="px-3 py-3 text-sm text-text-muted">
                      Nothing left on this bill. Add something, or cancel.
                    </li>
                  )}
                </ul>

                <div>
                  <Label htmlFor="addq">Add a piece</Label>
                  <div className="flex gap-2">
                    <Input
                      id="addq"
                      value={addQ}
                      onChange={(e) => setAddQ(e.target.value)}
                      placeholder="Scan a tag or type a name"
                    />
                    <Button
                      variant="secondary"
                      disabled={pending || addQ.trim().length < 2}
                      onClick={() =>
                        start(async () => {
                          const r = await searchCatalog(locationId, addQ.trim(), 8);
                          if (r.ok) setAddHits(r.data);
                          else setError(r.error);
                        })
                      }
                    >
                      Find
                    </Button>
                  </div>
                  {addHits.length > 0 && (
                    <ul className="mt-1 divide-y divide-border rounded-card border border-border">
                      {addHits.map((i) => (
                        <li key={i.item_id}>
                          <button
                            type="button"
                            onClick={() => addItem(i)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-sunken"
                          >
                            <span className="min-w-0 flex-1 truncate">{i.name}</span>
                            <span className="text-2xs text-text-muted">{i.qty} left</span>
                            <span className="tnum font-mono text-2xs">
                              {formatPaise(i.price_paise)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-2xs text-text-muted">Paid by</span>
                  {METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPayMethod(m)}
                      className={`rounded-control px-2.5 py-1 text-2xs capitalize ${
                        payMethod === m
                          ? "bg-brand text-brand-fg"
                          : "border border-border hover:bg-surface-sunken"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                <div className="flex items-baseline justify-between rounded-control bg-surface-sunken px-3 py-2">
                  <span className="text-sm">
                    New total
                    {newTotal !== bill.totalPaise && (
                      <span className="ml-2 text-2xs text-text-muted">
                        was {formatPaise(bill.totalPaise)}
                      </span>
                    )}
                  </span>
                  <span className="tnum font-mono text-lg">{formatPaise(newTotal)}</span>
                </div>

                <div>
                  <Label htmlFor="why">Why</Label>
                  <Input
                    id="why"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="wrong quantity rung"
                  />
                </div>

                <p className="rounded-control bg-status-pending-bg px-3 py-2 text-2xs text-status-pending-fg">
                  {bill.billNo} will be cancelled and a new invoice issued. Stock goes
                  back and comes out again. <strong>The owner is emailed.</strong>
                </p>

                {confirmEdit ? (
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      disabled={pending || newTotal === 0 || !reason.trim()}
                      onClick={() =>
                        run(
                          () =>
                            editBill(
                              bill.billId,
                              (lines ?? [])
                                .filter((l) => l.qty > 0)
                                .map((l) => ({
                                  item_id: l.itemId,
                                  qty: l.qty,
                                  unit_price_paise: l.unitPaise,
                                  discount_paise: 0,
                                  sold_by: l.soldBy,
                                })),
                              [{ method: payMethod, amount_paise: newTotal }],
                              reason,
                            ),
                          `${bill.billNo} corrected. The owner has been emailed.`,
                        )
                      }
                    >
                      {pending ? "Correcting…" : "Yes, correct it"}
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmEdit(false)}>
                      Go back
                    </Button>
                  </div>
                ) : (
                  <Row
                    onBack={() => setMode("menu")}
                    disabled={newTotal === 0 || !reason.trim()}
                    goLabel="Correct this bill"
                    onGo={() => setConfirmEdit(true)}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Action({
  label,
  hint,
  onClick,
  danger,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-control border px-3 py-2.5 text-left transition-colors ${
        danger
          ? "border-status-danger-fg/30 hover:bg-status-danger-bg"
          : "border-border hover:bg-surface-sunken"
      }`}
    >
      <span className="block text-sm font-medium">{label}</span>
      <span className="block text-2xs text-text-muted">{hint}</span>
    </button>
  );
}

function Row({
  onBack,
  onGo,
  disabled,
  hideGo,
  goLabel = "Save",
}: {
  onBack: () => void;
  onGo?: () => void;
  disabled?: boolean;
  hideGo?: boolean;
  goLabel?: string;
}) {
  return (
    <div className="flex gap-2">
      {!hideGo && (
        <Button variant="primary" disabled={disabled} onClick={onGo}>
          {goLabel}
        </Button>
      )}
      <Button variant="ghost" onClick={onBack}>
        Back
      </Button>
    </div>
  );
}
