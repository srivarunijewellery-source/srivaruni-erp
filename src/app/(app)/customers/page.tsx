import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { listCustomers, listUpcomingOccasions } from "@/features/customers/queries";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CustomerSearch } from "@/features/customers/CustomerSearch";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [user, { q = "" }] = await Promise.all([requireUser(), searchParams]);
  const [customers, occasions] = await Promise.all([
    listCustomers(q),
    listUpcomingOccasions(30),
  ]);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Identified by phone number, so the same person coming back lands on the same record."
        action={
          can(user.role, "customer.manage") && (
            <Link href={`${ROUTES.customers}/new`}>
              <Button variant="primary">Add customer</Button>
            </Link>
          )
        }
      />

      {occasions.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <span className="font-medium">Coming up in the next 30 days</span>
          </CardHeader>
          <CardBody className="py-0">
            <ul className="divide-y divide-border">
              {occasions.slice(0, 8).map((o) => (
                <li
                  key={`${o.customer.id}-${o.occasion}`}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <Link
                    href={ROUTES.customerDetail(o.customer.id)}
                    className="min-w-0 flex-1 truncate text-sm hover:underline"
                  >
                    {o.customer.name ?? o.customer.phone}
                  </Link>
                  <span className="text-2xs capitalize text-text-muted">{o.occasion}</span>
                  <span className="tnum font-mono text-2xs">{formatDate(o.date)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <div className="mb-4">
        <CustomerSearch initial={q} />
      </div>

      {customers.length === 0 ? (
        <EmptyState
          title={q ? "Nobody matches that" : "No customers yet"}
          hint={
            q
              ? "Try part of a name, or the last few digits of a number."
              : "Add someone at the counter and they'll appear here."
          }
        />
      ) : (
        <Card>
          <CardBody className="py-0">
            <ul className="divide-y divide-border">
              {customers.map((c) => (
                <li key={c.id} className="py-2.5">
                  <Link
                    href={ROUTES.customerDetail(c.id)}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {c.name ?? <span className="text-text-muted">No name</span>}
                      </p>
                      <p className="font-mono text-2xs text-text-muted">
                        {c.phone}
                        {c.city && ` · ${c.city}`}
                      </p>
                    </div>
                    {c.gstin && (
                      <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-2xs text-text-muted">
                        GST
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </>
  );
}
