import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import {
  getCustomer,
  getCustomerSummary,
  listCustomerPurchases,
} from "@/features/customers/queries";
import { fetchCustomerCredits } from "@/features/pos/actions";
import { listCustomerCoupons } from "@/features/coupons/queries";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CustomerForm } from "@/features/customers/CustomerForm";
import { formatDate } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { Badge } from "@/components/ui/Badge";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const [{ id }, { edit }, user] = await Promise.all([params, searchParams, requireUser()]);
  const customer = await getCustomer(id);
  if (!customer) notFound();

  const [coupons, summary, purchases, creditsRes] = await Promise.all([
    listCustomerCoupons(customer.id),
    getCustomerSummary(customer.id),
    listCustomerPurchases(customer.id),
    fetchCustomerCredits(customer.id),
  ]);
  const credits = creditsRes.ok ? creditsRes.data : [];
  const creditPaise = credits.reduce((s, c) => s + c.balancePaise, 0);

  const editing = edit === "1" && can(user, "customer.manage");

  return (
    <>
      <PageHeader
        title={customer.name ?? customer.phone}
        description={customer.name ? customer.phone : "No name on file"}
        action={
          <div className="flex items-center gap-2">
            {!editing && can(user, "customer.manage") && (
              <Link href={`${ROUTES.customerDetail(customer.id)}?edit=1`}>
                <Button size="sm" variant="secondary">
                  Edit
                </Button>
              </Link>
            )}
            <Link href={ROUTES.customers}>
              <Button size="sm" variant="ghost">
                All customers
              </Button>
            </Link>
          </div>
        }
      />

      {editing ? (
        <CustomerForm customer={customer} />
      ) : (
        <Card>
          <CardHeader>
            <span className="font-medium">Details</span>
          </CardHeader>
          <CardBody className="grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Phone" value={customer.phone} mono />
            <Detail label="Email" value={customer.email} />
            <Detail label="City" value={customer.city} />
            <Detail
              label="Date of birth"
              value={customer.dob ? formatDate(customer.dob) : null}
            />
            <Detail
              label="Anniversary"
              value={customer.anniversary ? formatDate(customer.anniversary) : null}
            />
            <Detail label="GSTIN" value={customer.gstin} mono />
            <Detail label="PAN" value={customer.pan} mono />
            <Detail label="Added" value={formatDate(customer.createdAt)} />
            {customer.notes && (
              <div className="sm:col-span-2">
                <p className="text-2xs uppercase tracking-wide text-text-muted">Notes</p>
                <p>{customer.notes}</p>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {coupons.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <span className="font-medium">Coupons held</span>
          </CardHeader>
          <CardBody className="py-0">
            <ul className="divide-y divide-border">
              {coupons.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="font-mono text-sm font-medium">{c.code}</span>
                  <span className="min-w-0 flex-1 truncate text-2xs text-text-muted">
                    {c.batchName}
                  </span>
                  <span className="text-2xs capitalize text-text-muted">{c.status}</span>
                  <span className="tnum font-mono text-2xs">
                    till {formatDate(c.validTo)}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {credits.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">Credit to spend</span>
            <span className="tnum font-mono text-lg">{formatPaise(creditPaise)}</span>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-border">
              {credits.map((c) => (
                <li
                  key={c.creditNoteId}
                  className="flex flex-wrap items-baseline gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="font-mono font-medium">{c.noteNo}</span>
                  <span className="min-w-0 flex-1 truncate text-2xs text-text-muted">
                    {c.returnNo ? `from ${c.returnNo}` : "issued manually"}
                    {c.spentPaise > 0 ? ` · ${formatPaise(c.spentPaise)} already used` : ""}
                    {c.validUntil ? ` · good until ${formatDate(c.validUntil)}` : ""}
                  </span>
                  <span className="tnum font-mono">{formatPaise(c.balancePaise)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium">What they have bought</span>
          {summary.favouriteCategory && (
            <span className="text-2xs text-text-muted">
              mostly {summary.favouriteCategory}
            </span>
          )}
        </CardHeader>

        {summary.bills === 0 ? (
          <CardBody>
            <p className="text-sm text-text-muted">
              Nothing bought yet. Bills rung at the counter against this phone number
              show up here, piece by piece.
            </p>
          </CardBody>
        ) : (
          <>
            <CardBody className="grid grid-cols-2 gap-3 border-b border-border sm:grid-cols-4">
              <Stat label="Spent" value={formatPaise(summary.spentPaise)} />
              <Stat
                label="Bills"
                value={`${summary.bills}`}
                hint={`${summary.pieces} piece${summary.pieces === 1 ? "" : "s"}`}
              />
              <Stat label="Average bill" value={formatPaise(summary.avgBillPaise)} />
              <Stat
                label="Last visit"
                value={summary.lastVisit ? formatDate(summary.lastVisit) : "—"}
                hint={
                  summary.firstVisit ? `first ${formatDate(summary.firstVisit)}` : undefined
                }
              />
            </CardBody>

            <CardBody className="py-0">
              <ul className="divide-y divide-border">
                {purchases.map((b) => (
                  <li key={b.billId} className="py-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono text-sm font-medium">{b.billNo}</span>
                      <span className="text-2xs text-text-muted">
                        {formatDate(b.billDate)}
                        {b.locationCode ? ` · ${b.locationCode}` : ""}
                      </span>
                      {b.status === "cancelled" && <Badge tone="danger">cancelled</Badge>}
                      <span className="ml-auto tnum font-mono text-sm">
                        {formatPaise(b.totalPaise)}
                      </span>
                    </div>

                    <ul className="mt-1.5 space-y-1">
                      {b.lines.map((l) => (
                        <li
                          key={l.itemId + l.billId}
                          className="flex flex-wrap items-baseline gap-2 text-sm"
                        >
                          <Link
                            href={ROUTES.productDetail(l.itemId)}
                            className="min-w-0 flex-1 truncate hover:text-brand hover:underline"
                          >
                            {l.itemName}
                          </Link>
                          {l.category && (
                            <span className="text-2xs text-text-subtle">{l.category}</span>
                          )}
                          <span className="tnum font-mono text-2xs text-text-muted">
                            ×{l.qty}
                          </span>
                          <span className="tnum w-24 text-right font-mono text-2xs">
                            {formatPaise(l.lineTotalPaise)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </CardBody>
          </>
        )}
      </Card>
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
    <div>
      <p className="text-2xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="tnum font-mono text-lg">{value}</p>
      {hint && <p className="text-2xs text-text-subtle">{hint}</p>}
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-2xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className={mono ? "font-mono" : undefined}>{value || "—"}</p>
    </div>
  );
}
