import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { listAccounts, type AccountKind } from "@/features/accounting/queries";

export const metadata: Metadata = { title: "Chart of accounts" };

const KIND_LABEL: Record<AccountKind, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

const ORDER: AccountKind[] = ["asset", "liability", "equity", "income", "expense"];

export default async function ChartPage() {
  const user = await requireUser();
  if (!can(user.role, "accounts.manage")) {
    return <EmptyState title="The chart of accounts is owner-only" />;
  }

  const accounts = await listAccounts();

  return (
    <>
      <PageHeader
        title="Chart of accounts"
        description="Every rupee that moves lands on two of these."
      />
      <div className="space-y-4">
        {ORDER.map((kind) => {
          const group = accounts.filter((a) => a.kind === kind);
          if (group.length === 0) return null;

          return (
            <Card key={kind}>
              <CardHeader className="font-medium">{KIND_LABEL[kind]}</CardHeader>
              <CardBody className="p-0">
                <ul className="divide-y divide-border">
                  {group.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <span className="w-14 font-mono text-2xs text-text-muted">{a.code}</span>
                      <span className="flex-1 truncate">{a.name}</span>
                      {a.isExpenseCategory && <Badge tone="neutral">Expense category</Badge>}
                      {a.systemKey && (
                        <span
                          className="font-mono text-2xs text-text-subtle"
                          title="Auto-posting finds this account by this key, so it survives a rename."
                        >
                          {a.systemKey}
                        </span>
                      )}
                      {!a.active && <Badge tone="danger">Inactive</Badge>}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          );
        })}
        <p className="px-1 text-2xs text-text-muted">
          Accounts marked with a key are wired into auto-posting. Renaming one is safe;
          deleting it would break posting, so it is not offered.
        </p>
      </div>
    </>
  );
}
