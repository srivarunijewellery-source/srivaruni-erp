"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { FieldError } from "@/components/ui/Field";
import { formatPaise } from "@/lib/money";
import { PersonIcon } from "@/components/ui/Icon";
import { loadBillLines, reassignBill, reassignLine } from "./seller-actions";
import type { BillLineDetail } from "./dashboard-queries";
import type { Seller } from "./queries";

/**
 * Correcting who gets credit, after the sale.
 *
 * The cashier rings everything under one name because the customer is
 * waiting; who actually sold what gets sorted out afterwards. Without
 * this the only fix would be cancel-and-rebill, which corrupts stock
 * and the books to correct an attribution.
 */
export function BillSellerEditor({
  billId,
  billNo,
  sellers,
  onClose,
}: {
  billId: string;
  billNo: string;
  sellers: Seller[];
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [lines, setLines] = useState<BillLineDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);

  function refresh() {
    start(async () => {
      const r = await loadBillLines(billId);
      if (r.ok) setLines(r.data);
      else setError(r.error);
      setLoading(false);
    });
  }

  useEffect(refresh, [billId]);

  function setLineSeller(lineId: string, staffId: string | null) {
    start(async () => {
      setError(null);
      const r = await reassignLine(lineId, staffId);
      if (r.ok) {
        setOpenFor(null);
        refresh();
      } else setError(r.error);
    });
  }

  function setAll(staffId: string) {
    start(async () => {
      setError(null);
      const r = await reassignBill(billId, staffId);
      if (r.ok) refresh();
      else setError(r.error);
    });
  }

  return (
    <Modal title={`Salesman · ${billNo}`} onClose={onClose} width="max-w-2xl">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xs text-text-muted">Credit the whole invoice to</span>
          {sellers.slice(0, 6).map((s) => (
            <Button
              key={s.id}
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => setAll(s.id)}
            >
              {s.name}
            </Button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : (
          <ul className="divide-y divide-border rounded-control border border-border">
            {lines.map((l) => (
              <li key={l.id} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-32 flex-1">
                    <p className="text-sm">{l.itemName}</p>
                    <p className="text-2xs text-text-muted">
                      {l.qty} × · {formatPaise(l.lineTotalPaise)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setOpenFor(openFor === l.id ? null : l.id)}
                    className="flex h-7 items-center gap-1 rounded-full border border-border px-2.5 text-2xs hover:bg-surface-sunken"
                  >
                    <PersonIcon size="size-3.5" />
                    {l.soldByName ?? "unassigned"}
                  </button>
                </div>

                {openFor === l.id && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {sellers.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        disabled={pending}
                        onClick={() => setLineSeller(l.id, s.id)}
                        className={`rounded-control px-2.5 py-1 text-2xs ${
                          l.soldById === s.id
                            ? "bg-brand text-brand-fg"
                            : "border border-border hover:bg-surface-sunken"
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <FieldError>{error}</FieldError>

        <p className="text-2xs text-text-muted">
          <Badge tone="neutral">today only</Badge> Ordinary staff can change credit on
          today&rsquo;s invoices. Anything older needs a manager, because attribution
          drives incentive and moving it after a payout has been worked out turns a paid
          incentive into an argument.
        </p>
      </div>
    </Modal>
  );
}
