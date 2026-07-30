import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import {
  listAccounts,
  listVendorBalances,
  listPayments,
} from "@/features/payments/queries";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { PaymentForm } from "@/features/payments/PaymentForm";
import { formatPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const user = await requireUser();

  if (!can(user.role, "inward.viewCost")) {
    return (
      <EmptyState
        title="Payments are owner-only"
        hint="This page shows account balances and what is owed to each vendor."
      />
    );
  }

  const [accounts, balances, payments] = await Promise.all([
    listAccounts(),
    listVendorBalances(),
    listPayments(),
  ]);

  const totalDue = balances.reduce((s, b) => s + Math.max(0, b.duePaise), 0);
  const totalAdvance = balances.reduce((s, b) => s + Math.max(0, b.advancePaise), 0);
  const totalCredit = balances.reduce((s, b) => s + b.creditPaise, 0);
  const totalCreditUnapplied = balances.reduce((s, b) => s + b.creditUnappliedPaise, 0);
  const owing = balances.filter((b) => b.duePaise > 0);

  return (
    <>
      <PageHeader
        title="Payments"
        description="What is in each account, what is owed, and what has been paid."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total owed" value={formatPaise(totalDue)} emphasis />
        <Stat label="Advances out" value={formatPaise(totalAdvance)} />
        <Stat
          label="Credit notes"
          value={
            totalCredit > 0
              ? `${formatPaise(totalCredit)}${
                  totalCreditUnapplied > 0
                    ? ` · ${formatPaise(totalCreditUnapplied)} unapplied`
                    : ""
                }`
              : "—"
          }
        />
        <Stat label="Vendors owing" value={String(owing.length)} />
        <Stat
          label="Cash and bank"
          value={formatPaise(accounts.reduce((s, a) => s + a.balancePaise, 0))}
        />
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {accounts.map((a) => (
          <Card key={a.id}>
            <CardBody>
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-2xs uppercase tracking-wide text-text-subtle">
                    {a.kind}
                    {a.bankName ? ` · ${a.bankName}` : ""}
                  </p>
                </div>
                <p
                  className={`tnum text-lg font-semibold ${
                    a.balancePaise < 0 ? "text-status-danger-fg" : ""
                  }`}
                >
                  {formatPaise(a.balancePaise)}
                </p>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="mb-5">
        <PaymentForm accounts={accounts} vendors={balances} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-medium">Outstanding by vendor</h2>
          </CardHeader>
          <CardBody className="p-0">
            {balances.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-text-muted">
                No vendor activity yet.
              </p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-sunken">
                    <Th>Vendor</Th>
                    <Th right>Purchased</Th>
                    <Th right>Paid</Th>
                    <Th right>Advance</Th>
                    <Th right>Credit</Th>
                    <Th right>Due</Th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={b.vendorId} className="border-b border-border last:border-0">
                      <td className="px-2 py-1.5">
                        <Link
                          href={ROUTES.vendorDetail(b.vendorId)}
                          className="hover:text-brand"
                        >
                          {b.vendorName}
                        </Link>
                      </td>
                      <td className="tnum px-2 py-1.5 text-right text-text-muted">
                        {formatPaise(b.purchasedPaise)}
                      </td>
                      <td className="tnum px-2 py-1.5 text-right text-text-muted">
                        {formatPaise(b.paidPaise)}
                      </td>
                      <td className="tnum px-2 py-1.5 text-right">
                        {b.advancePaise > 0 ? formatPaise(b.advancePaise) : "—"}
                      </td>
                      {/* Credits already reduce Due. What is worth seeing is
                          how much is still floating, not yet tied to a bill. */}
                      <td className="tnum px-3 py-2 text-right">
                        {b.creditPaise > 0 ? (
                          <>
                            {formatPaise(b.creditPaise)}
                            {b.creditUnappliedPaise > 0 && (
                              <span className="block text-2xs text-text-muted">
                                {formatPaise(b.creditUnappliedPaise)} unapplied
                              </span>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        className={`tnum px-2 py-1.5 text-right font-medium ${
                          b.duePaise > 0 ? "text-status-danger-fg" : "text-text-muted"
                        }`}
                      >
                        {b.duePaise > 0 ? formatPaise(b.duePaise) : "Settled"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-medium">Recent payments</h2>
          </CardHeader>
          <CardBody className="p-0">
            {payments.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-text-muted">
                No payments recorded yet.
              </p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-sunken">
                    <Th>Ref</Th>
                    <Th>Vendor</Th>
                    <Th>Date</Th>
                    <Th right>Amount</Th>
                    <Th>Set against</Th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="px-2 py-1.5 font-mono text-2xs">{p.docNo}</td>
                      <td className="truncate px-2 py-1.5">{p.vendorName}</td>
                      <td className="px-2 py-1.5 text-2xs">{formatDate(p.paidOn)}</td>
                      <td className="tnum px-2 py-1.5 text-right font-medium">
                        {formatPaise(p.amountPaise)}
                      </td>
                      <td className="px-2 py-1.5">
                        {p.allocatedPaise >= p.amountPaise ? (
                          <Badge tone="done">Bills</Badge>
                        ) : p.allocatedPaise === 0 ? (
                          <Badge tone="approved">Advance</Badge>
                        ) : (
                          <Badge tone="pending">Part</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text-muted ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
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
