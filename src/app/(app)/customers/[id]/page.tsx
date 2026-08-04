import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { getCustomer } from "@/features/customers/queries";
import { listCustomerCoupons } from "@/features/coupons/queries";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CustomerForm } from "@/features/customers/CustomerForm";
import { formatDate } from "@/lib/format";

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

  const coupons = await listCustomerCoupons(customer.id);

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

      <Card className="mt-4">
        <CardBody>
          <p className="text-sm text-text-muted">
            Purchase history will appear here once billing is built. Nothing links a sale to
            a customer yet.
          </p>
        </CardBody>
      </Card>
    </>
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
