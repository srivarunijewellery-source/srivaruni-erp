"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { BillPeek } from "@/features/sales/BillPeek";
import { CustomerPeek } from "@/features/customers/CustomerPeek";
import { fetchBillsBehind } from "./actions";
import type { RecentBill } from "./dashboard-queries";

export interface DrillSpec {
  title: string;
  from: string;
  to: string;
  locationId?: string | null;
  method?: string | null;
  staffId?: string | null;
  discountedOnly?: boolean;
}

/**
 * The bills behind a figure on the dashboard.
 *
 * Every number on that page is a sum of documents, and the useful next
 * question is always "which ones". This opens over the dashboard, and
 * the rows inside open further — bill, customer — so you can get from a
 * total to a single line item without ever navigating away.
 */
export function BillsBehind({
  spec,
  onClose,
}: {
  spec: DrillSpec;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<RecentBill[] | null>(null);
  const [peek, setPeek] = useState<{ id: string; no: string } | null>(null);
  const [cust, setCust] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await fetchBillsBehind(spec);
      if (!cancelled) setRows(r.ok ? r.data : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [spec]);

  const total = (rows ?? []).reduce((s, b) => s + b.totalPaise, 0);

  return (
    <>
      <Modal title={spec.title} onClose={onClose} width="max-w-3xl">
        {rows === null ? (
          <p className="py-8 text-center text-sm text-text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">
            No bills match that.
          </p>
        ) : (
          <>
            <p className="mb-2 text-2xs text-text-muted">
              {rows.length} bill{rows.length === 1 ? "" : "s"} ·{" "}
              <span className="tnum font-mono text-text">{formatPaise(total)}</span>
              {rows.length >= 500 && " · showing the most recent 500"}
            </p>
            <ul className="max-h-[26rem] divide-y divide-border overflow-auto rounded-card border border-border">
              {rows.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center gap-2 px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => setPeek({ id: b.id, no: b.billNo })}
                    className="w-32 shrink-0 text-left font-mono text-2xs text-brand hover:underline"
                  >
                    {b.billNo}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {b.customerId ? (
                      <button
                        type="button"
                        onClick={() =>
                          setCust({
                            id: b.customerId!,
                            name: b.customerName ?? "Customer",
                          })
                        }
                        className="hover:text-brand hover:underline"
                      >
                        {b.customerName ?? "Customer"}
                      </button>
                    ) : (
                      <span className="text-text-muted">Walk-in</span>
                    )}
                    <span className="ml-2 text-2xs text-text-subtle">
                      {formatDate(b.billDate)}
                      {b.locationCode ? ` · ${b.locationCode}` : ""}
                      {b.soldByName ? ` · ${b.soldByName}` : ""}
                    </span>
                  </span>
                  {b.paymentMode && (
                    <Badge tone="neutral">{b.paymentMode}</Badge>
                  )}
                  <span className="tnum w-24 shrink-0 text-right font-mono text-sm">
                    {formatPaise(b.totalPaise)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal>

      {peek && (
        <BillPeek billId={peek.id} billNo={peek.no} onClose={() => setPeek(null)} />
      )}
      {cust && (
        <CustomerPeek
          customerId={cust.id}
          name={cust.name}
          onClose={() => setCust(null)}
        />
      )}
    </>
  );
}
