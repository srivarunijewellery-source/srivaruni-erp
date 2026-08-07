"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { itemPhotoUrl } from "@/lib/storage";
import { ROUTES } from "@/config/nav";
import { formatDate } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { fetchBillDetail } from "./actions";
import type { BillDetail } from "./queries";

/**
 * A bill, read without leaving the page you were reading.
 *
 * Clicking a bill number used to navigate away, which is the wrong
 * trade: you are usually scanning a list and want to check ONE thing on
 * ONE bill before carrying on. Losing your scroll position, your
 * filters and your place in the list to answer that is a bad deal, so
 * this opens over the top and closes back to exactly where you were.
 *
 * The full page still exists for when a bill IS the destination -- there
 * is a link to it in the corner, and it is what a shared URL opens.
 */
export function BillPeek({
  billId,
  billNo,
  onClose,
}: {
  billId: string;
  billNo: string;
  onClose: () => void;
}) {
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await fetchBillDetail(billId);
      if (cancelled) return;
      if (r.ok) setBill(r.data);
      else setError(r.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [billId]);

  return (
    <Modal title={billNo} onClose={onClose} width="max-w-3xl">
      {error ? (
        <p className="text-sm text-status-danger-fg">{error}</p>
      ) : !bill ? (
        <p className="py-8 text-center text-sm text-text-muted">Reading the bill…</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-2xs text-text-muted">
            <span>{formatDate(bill.billDate)}</span>
            {bill.locationName && <span>· {bill.locationName}</span>}
            {bill.soldByName && <span>· sold by {bill.soldByName}</span>}
            {bill.status === "cancelled" && <Badge tone="danger">cancelled</Badge>}
            <Link
              href={ROUTES.billDetail(bill.id)}
              className="ml-auto text-brand hover:underline"
            >
              Open full page ↗
            </Link>
          </div>

          {bill.customerId && (
            <p className="text-sm">
              <Link
                href={ROUTES.customerDetail(bill.customerId)}
                className="hover:text-brand hover:underline"
              >
                {bill.customerName ?? bill.customerPhone}
              </Link>
            </p>
          )}

          <ul className="divide-y divide-border rounded-card border border-border">
            {bill.lines.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-3 py-2">
                <PhotoThumb src={itemPhotoUrl(l.photoPath)} alt={l.itemName} size={40} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={ROUTES.productDetail(l.itemId)}
                    className="block truncate text-sm font-medium hover:text-brand"
                  >
                    {l.itemName}
                  </Link>
                  <span className="font-mono text-2xs text-text-subtle">
                    {l.barcode ?? "no tag"} · {formatPaise(l.unitPricePaise)} each
                    {l.returnedQty > 0 && ` · ${l.returnedQty} returned`}
                  </span>
                </div>
                <span className="tnum shrink-0 font-mono text-2xs text-text-muted">
                  ×{l.qty}
                </span>
                <span className="tnum w-24 shrink-0 text-right font-mono text-sm">
                  {formatPaise(l.lineTotalPaise)}
                </span>
              </li>
            ))}
          </ul>

          <div className="space-y-1 text-sm">
            <Row label="Gross" value={formatPaise(bill.grossPaise)} />
            {bill.manualDiscountPaise > 0 && (
              <Row label="Discount" value={`− ${formatPaise(bill.manualDiscountPaise)}`} />
            )}
            {bill.couponDiscountPaise > 0 && (
              <Row label="Coupon" value={`− ${formatPaise(bill.couponDiscountPaise)}`} />
            )}
            {bill.igstPaise > 0 ? (
              <Row label="IGST" value={formatPaise(bill.igstPaise)} />
            ) : (
              <>
                <Row label="CGST" value={formatPaise(bill.cgstPaise)} />
                <Row label="SGST" value={formatPaise(bill.sgstPaise)} />
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-control bg-brand px-4 py-3 text-brand-fg">
            <span className="text-2xs font-medium uppercase tracking-widest opacity-80">
              Total
            </span>
            <span className="tnum font-mono text-2xl leading-none">
              {formatPaise(bill.totalPaise)}
            </span>
          </div>

          {bill.payments.length > 0 && (
            <p className="text-2xs text-text-muted">
              Paid by{" "}
              {bill.payments
                .map((p) => `${p.method} ${formatPaise(p.amountPaise)}`)
                .join(" · ")}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="capitalize text-text-muted">{label}</span>
      <span className="tnum font-mono">{value}</span>
    </div>
  );
}
