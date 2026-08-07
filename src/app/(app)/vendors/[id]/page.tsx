import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import {
  getVendor,
  getVendorPurchases,
  getVendorBalance,
} from "@/features/vendors/queries";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { VendorDetailCard } from "@/features/vendors/VendorDetailCard";
import { VendorPricingCard } from "@/features/pricing/VendorPricingCard";
import { CreditNotesCard } from "@/features/credits/CreditNotesCard";
import { listCreditNotes, listOpenBills } from "@/features/credits/queries";
import { getSettlement } from "@/features/credits/settlement";
import { SettlementPanel } from "@/features/credits/SettlementPanel";
import { formatPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { listPayments } from "@/features/payments/queries";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  if (!can(user, "vendor.view")) {
    return <EmptyState title="Vendors are not available to your role" />;
  }

  const [vendor, purchases, balance, payments, creditNotes, openBills, settlement] =
    await Promise.all([
    getVendor(id),
    getVendorPurchases(id),
    getVendorBalance(id),
    listPayments(id),
    listCreditNotes(id),
    listOpenBills(id),
    getSettlement(id),
  ]);

  if (!vendor) notFound();

  return (
    <>
      <PageHeader
        title={vendor.name}
        description={[vendor.placeOfBusiness, vendor.city].filter(Boolean).join(" · ")}
        action={
          <Link href={ROUTES.vendors} className="text-sm text-brand hover:underline">
            All vendors
          </Link>
        }
      />

      {balance && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Purchased" value={formatPaise(balance.purchasedPaise)} />
          <Stat label="Paid" value={formatPaise(balance.paidPaise)} />
          <Stat label="Advance with vendor" value={formatPaise(balance.advancePaise)} />
          <Stat
            label={balance.duePaise >= 0 ? "Due" : "In credit"}
            value={formatPaise(Math.abs(balance.duePaise))}
            emphasis
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <VendorDetailCard vendor={vendor} />
          {can(user, "pricing.manage") && (
            <VendorPricingCard
              vendorId={vendor.id}
              pricingMode={vendor.pricingMode}
              codeMultiple={vendor.codeMultiple}
              codeHasDateSuffix={vendor.codeHasDateSuffix}
              pricingNote={vendor.pricingNote}
            />
          )}

          {/* Credits are money owed, so the same gate as payments. */}
          {can(user, "cost.view") && (
            <div className="mt-4">
              <SettlementPanel vendorId={vendor.id} settlement={settlement} />
            </div>
          )}

          {can(user, "cost.view") && (
            <div className="mt-4">
              <CreditNotesCard
                vendorId={vendor.id}
                notes={creditNotes}
                bills={openBills}
                unappliedPaise={balance?.creditUnappliedPaise ?? 0}
              />
            </div>
          )}
          <div className="mt-4">
            <Card>
              <CardHeader>
                <h2 className="font-medium">Payments</h2>
              </CardHeader>
              <CardBody className="p-0">
                {payments.length === 0 ? (
                  <p className="px-4 py-4 text-center text-sm text-text-muted">
                    Nothing paid to this vendor yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="min-w-0">
                          <span className="font-mono text-2xs">{p.docNo}</span>
                          <p className="text-2xs text-text-muted">
                            {formatDate(p.paidOn)} · {p.accountName}
                          </p>
                        </div>
                        <span className="tnum text-sm font-medium">
                          {formatPaise(p.amountPaise)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <h2 className="font-medium">Purchase history</h2>
            </CardHeader>
            <CardBody className="p-0">
              {purchases.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-text-muted">
                  No purchases recorded from this vendor yet.
                </p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-sunken">
                      {["Document", "Bill", "Date", "Pcs", "Taxable", "Tax", "Total", ""].map(
                        (h, i) => (
                          <th
                            key={h + i}
                            className={`px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text-muted ${
                              i >= 3 && i <= 6 ? "text-right" : "text-left"
                            }`}
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((p) => (
                      <tr key={p.inwardId} className="border-b border-border last:border-0">
                        <td className="px-2 py-1.5">
                          <Link
                            href={ROUTES.inwardDetail(p.inwardId)}
                            className="font-mono text-2xs hover:text-brand"
                          >
                            {p.docNo}
                          </Link>
                        </td>
                        <td className="px-2 py-1.5 text-2xs text-text-muted">
                          {p.invoiceNo ?? "—"}
                        </td>
                        <td className="px-2 py-1.5 text-2xs">
                          {formatDate(p.invoiceDate ?? p.createdAt)}
                        </td>
                        <td className="tnum px-2 py-1.5 text-right">{p.pieces}</td>
                        <td className="tnum px-2 py-1.5 text-right text-text-muted">
                          {formatPaise(p.taxablePaise)}
                        </td>
                        <td className="tnum px-2 py-1.5 text-right text-text-muted">
                          {formatPaise(p.taxPaise)}
                        </td>
                        <td className="tnum px-2 py-1.5 text-right font-medium">
                          {formatPaise(p.totalPaise)}
                        </td>
                        <td className="px-2 py-1.5">
                          <Badge tone={p.status === "approved" ? "done" : "pending"}>
                            {p.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-card border border-border bg-surface px-3 py-2">
      <p className="text-2xs uppercase tracking-wide text-text-subtle">{label}</p>
      <p className={emphasis ? "tnum mt-0.5 text-xl font-semibold" : "tnum mt-0.5 text-base font-medium"}>
        {value}
      </p>
    </div>
  );
}

