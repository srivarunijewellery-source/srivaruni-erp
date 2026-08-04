import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardBody } from "@/components/ui/Card";
import { formatPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { ROUTES } from "@/config/nav";
import { getAccountStatement, listAccounts } from "@/features/accounting/queries";

export const metadata: Metadata = { title: "Account statement" };

export default async function StatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "accounts.view")) {
    return <EmptyState title="The books are owner-only" />;
  }

  const { id } = await params;
  const [accounts, rows] = await Promise.all([listAccounts(), getAccountStatement(id)]);
  const account = accounts.find((a) => a.id === id);
  if (!account) notFound();

  const closing = rows.length > 0 ? rows[rows.length - 1]?.runningPaise ?? 0 : 0;

  return (
    <>
      <PageHeader
        title={account.name}
        description={`${account.code} · ${account.kind}`}
        crumbs={[
          { label: "Trial balance", href: ROUTES.trialBalance },
          { label: account.name },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState title="Nothing has touched this account yet" />
      ) : (
        <div className="space-y-4">
          <Card>
            <CardBody className="flex items-center justify-between">
              <span className="text-sm text-text-muted">
                {rows.length} {rows.length === 1 ? "line" : "lines"}
              </span>
              <div className="text-right">
                <p className="text-2xs text-text-muted">Closing balance</p>
                <p className="font-mono text-lg">{formatPaise(closing)}</p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="p-0">
              <ul className="divide-y divide-border">
                {rows.map((r, i) => (
                  <li key={`${r.entryId}-${i}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {r.narration}
                        {r.counterpart && (
                          <span className="ml-2 text-2xs text-text-muted">
                            &rarr; {r.counterpart}
                          </span>
                        )}
                      </p>
                      <p className="text-2xs text-text-muted">
                        {[formatDate(r.entryDate), r.entryNo, r.note]
                          .filter(Boolean)
                          .join(" \u00b7 ")}
                      </p>
                    </div>
                    <span className="w-28 text-right font-mono text-sm">
                      {r.debitPaise > 0 ? formatPaise(r.debitPaise) : ""}
                    </span>
                    <span className="w-28 text-right font-mono text-sm">
                      {r.creditPaise > 0 ? formatPaise(r.creditPaise) : ""}
                    </span>
                    <span className="w-32 text-right font-mono text-sm text-text-muted">
                      {formatPaise(r.runningPaise)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
