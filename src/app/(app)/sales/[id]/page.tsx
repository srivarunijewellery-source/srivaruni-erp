import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { itemPhotoUrl } from "@/lib/storage";
import { formatDate } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { getBillDetail } from "@/features/sales/queries";

export const metadata: Metadata = { title: "Bill" };

export default async function BillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  if (!can(user, "stock.view")) {
    return <EmptyState title="You do not have access to bills" />;
  }

  const bill = await getBillDetail(id);
  if (!bill) notFound();

  const cancelled = bill.status === "cancelled";

  return (
    <>
      <PageHeader
        title={bill.billNo}
        description={`${formatDate(bill.billDate)}${
          bill.locationName ? ` · ${bill.locationName}` : ""
        }${bill.soldByName ? ` · sold by ${bill.soldByName}` : ""}`}
        action={
          <Link
            href={ROUTES.sales}
            className="rounded-control border border-border px-3 py-2 text-sm hover:bg-surface-sunken"
          >
            Back to sales
          </Link>
        }
      />

      {/* A corrected bill is two documents. Each says so and points at
          the other, so neither is ever read as the whole story. */}
      {cancelled && (
        <p className="mb-4 rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
          This bill was cancelled
          {bill.editReason ? ` — ${bill.editReason}` : ""}.
          {bill.replacedByBillId && (
            <>
              {" "}Replaced by{" "}
              <Link
                href={ROUTES.billDetail(bill.replacedByBillId)}
                className="font-mono underline"
              >
                {bill.replacedByNo}
              </Link>
              .
            </>
          )}
        </p>
      )}
      {bill.replacesBillId && (
        <p className="mb-4 rounded-control bg-surface-sunken px-3 py-2 text-2xs text-text-muted">
          Corrects{" "}
          <Link
            href={ROUTES.billDetail(bill.replacesBillId)}
            className="font-mono hover:text-brand hover:underline"
          >
            {bill.replacesNo}
          </Link>
          .
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="font-medium">
              {bill.lines.length} line{bill.lines.length === 1 ? "" : "s"}
            </CardHeader>
            <CardBody className="p-0">
              <ul className="divide-y divide-border">
                {bill.lines.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                    <PhotoThumb
                      src={itemPhotoUrl(l.photoPath)}
                      alt={l.itemName}
                      size={40}
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={ROUTES.productDetail(l.itemId)}
                        className="block truncate text-sm font-medium hover:text-brand hover:underline"
                      >
                        {l.itemName}
                      </Link>
                      <p className="font-mono text-2xs text-text-subtle">
                        {l.barcode ?? "no tag"} · {formatPaise(l.unitPricePaise)} each
                        {l.discountPaise > 0 && ` · less ${formatPaise(l.discountPaise)}`}
                        {l.returnedQty > 0 && ` · ${l.returnedQty} returned`}
                      </p>
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
            </CardBody>
          </Card>

          {bill.gifts.length > 0 && (
            <Card>
              <CardHeader className="font-medium">Given free</CardHeader>
              <CardBody className="p-0">
                <ul className="divide-y divide-border">
                  {bill.gifts.map((g, i) => (
                    <li key={i} className="flex items-baseline gap-3 px-4 py-2 text-sm">
                      <span className="flex-1">{g.offerName}</span>
                      <span className="text-2xs text-text-muted">
                        {g.qty} × {g.itemName ?? "item"}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {bill.returns.length > 0 && (
            <Card>
              <CardHeader className="font-medium">Returned against this bill</CardHeader>
              <CardBody className="p-0">
                <ul className="divide-y divide-border">
                  {bill.returns.map((r) => (
                    <li key={r.id} className="flex items-baseline gap-3 px-4 py-2 text-sm">
                      <span className="font-mono">{r.returnNo}</span>
                      <span className="text-2xs text-text-muted">
                        {formatDate(r.returnDate)}
                        {r.creditNoteNo && ` · credit ${r.creditNoteNo}`}
                      </span>
                      <span className="tnum ml-auto font-mono">
                        {formatPaise(r.totalPaise)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <span className="font-medium">Total</span>
              {cancelled && <Badge tone="danger">cancelled</Badge>}
            </CardHeader>
            <CardBody className="space-y-1.5 text-sm">
              <Row label="Gross" value={formatPaise(bill.grossPaise)} />
              {bill.manualDiscountPaise > 0 && (
                <Row label="Discount" value={`− ${formatPaise(bill.manualDiscountPaise)}`} />
              )}
              {bill.schemeDiscountPaise > 0 && (
                <Row label="Scheme" value={`− ${formatPaise(bill.schemeDiscountPaise)}`} />
              )}
              {bill.couponDiscountPaise > 0 && (
                <Row label="Coupon" value={`− ${formatPaise(bill.couponDiscountPaise)}`} />
              )}
              <Row label="Taxable" value={formatPaise(bill.taxablePaise)} />
              {bill.igstPaise > 0 ? (
                <Row label="IGST" value={formatPaise(bill.igstPaise)} />
              ) : (
                <>
                  <Row label="CGST" value={formatPaise(bill.cgstPaise)} />
                  <Row label="SGST" value={formatPaise(bill.sgstPaise)} />
                </>
              )}
              <div className="flex items-center justify-between gap-3 rounded-control bg-brand px-3 py-2.5 text-brand-fg">
                <span className="text-2xs font-medium uppercase tracking-widest opacity-80">
                  Total
                </span>
                <span className="tnum font-mono text-2xl leading-none">
                  {formatPaise(bill.totalPaise)}
                </span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="font-medium">Paid by</CardHeader>
            <CardBody className="space-y-1.5 text-sm">
              {bill.payments.length === 0 ? (
                <p className="text-text-muted">Nothing recorded.</p>
              ) : (
                bill.payments.map((p, i) => (
                  <Row
                    key={i}
                    label={p.method + (p.reference ? ` · ${p.reference}` : "")}
                    value={formatPaise(p.amountPaise)}
                  />
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="font-medium">Customer</CardHeader>
            <CardBody className="text-sm">
              {bill.customerId ? (
                <Link
                  href={ROUTES.customerDetail(bill.customerId)}
                  className="hover:text-brand hover:underline"
                >
                  {bill.customerName ?? "Customer"}
                  <span className="block font-mono text-2xs text-text-muted">
                    {bill.customerPhone}
                  </span>
                </Link>
              ) : (
                <p className="text-text-muted">Walk-in — no customer on this bill.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
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
