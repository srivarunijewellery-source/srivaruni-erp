"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { ROUTES } from "@/config/nav";
import { formatDate } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { BillPeek } from "@/features/sales/BillPeek";
import { fetchCustomerCard, type CustomerCard } from "./card-actions";

/**
 * A customer, read without leaving the page.
 *
 * Same rule as bills: if there is data behind a name, the name opens it.
 * Anywhere a customer is shown — sales list, counter, dashboard — this
 * is what should open, so the behaviour is the same wherever you are.
 */
export function CustomerPeek({
  customerId,
  name,
  onClose,
}: {
  customerId: string;
  name: string;
  onClose: () => void;
}) {
  const [card, setCard] = useState<CustomerCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [peekBill, setPeekBill] = useState<{ id: string; no: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await fetchCustomerCard(customerId);
      if (cancelled) return;
      if (r.ok) setCard(r.data);
      else setError(r.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  return (
    <>
      <Modal title={name} onClose={onClose} width="max-w-2xl">
        {error ? (
          <p className="text-sm text-status-danger-fg">{error}</p>
        ) : !card ? (
          <p className="py-8 text-center text-sm text-text-muted">Loading…</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Spent" value={formatPaise(card.summary.spentPaise)} />
                <Stat
                  label="Bills"
                  value={String(card.summary.bills)}
                  hint={`${card.summary.pieces} pieces`}
                />
                <Stat label="Average" value={formatPaise(card.summary.avgBillPaise)} />
                <Stat
                  label="Last visit"
                  value={
                    card.summary.lastVisit ? formatDate(card.summary.lastVisit) : "—"
                  }
                />
              </div>
              <Link
                href={ROUTES.customerDetail(customerId)}
                className="shrink-0 text-2xs text-brand hover:underline"
              >
                Full page ↗
              </Link>
            </div>

            {card.summary.favouriteCategory && (
              <p className="text-2xs text-text-muted">
                Mostly buys {card.summary.favouriteCategory}
                {card.summary.firstVisit &&
                  ` · first came ${formatDate(card.summary.firstVisit)}`}
              </p>
            )}

            {card.credits.length > 0 && (
              <p className="rounded-control bg-status-done-bg px-3 py-2 text-sm text-status-done-fg">
                Holding{" "}
                {formatPaise(card.credits.reduce((s, c) => s + c.balancePaise, 0))} in
                credit notes.
              </p>
            )}

            {card.gifts.length > 0 && (
              <p className="text-2xs text-text-muted">
                Given: {card.gifts.map((g) => g.offerName).join(", ")}
              </p>
            )}

            {card.purchases.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-muted">
                Nothing bought yet.
              </p>
            ) : (
              <ul className="max-h-[22rem] divide-y divide-border overflow-auto rounded-card border border-border">
                {card.purchases.map((b) => (
                  <li key={b.billId} className="px-3 py-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <button
                        type="button"
                        onClick={() => setPeekBill({ id: b.billId, no: b.billNo })}
                        className="font-mono text-2xs text-brand hover:underline"
                      >
                        {b.billNo}
                      </button>
                      <span className="text-2xs text-text-muted">
                        {formatDate(b.billDate)}
                        {b.locationCode ? ` · ${b.locationCode}` : ""}
                      </span>
                      {b.status === "cancelled" && <Badge tone="danger">cancelled</Badge>}
                      <span className="tnum ml-auto font-mono text-sm">
                        {formatPaise(b.totalPaise)}
                      </span>
                    </div>
                    <p className="truncate text-2xs text-text-subtle">
                      {b.lines.map((l) => `${l.itemName} ×${l.qty}`).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>

      {peekBill && (
        <BillPeek
          billId={peekBill.id}
          billNo={peekBill.no}
          onClose={() => setPeekBill(null)}
        />
      )}
    </>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-control bg-surface-sunken px-2.5 py-1.5">
      <p className="text-2xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="tnum font-mono text-sm">{value}</p>
      {hint && <p className="text-2xs text-text-subtle">{hint}</p>}
    </div>
  );
}
