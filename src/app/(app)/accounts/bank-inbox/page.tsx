import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { isOwner } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { listBankInbox } from "@/features/bank/queries";
import { BankInbox } from "@/features/bank/BankInbox";
import { listAccounts } from "@/features/accounting/queries";
import { listStores } from "@/features/inward/queries";

export const metadata: Metadata = { title: "Bank alerts" };

const TABS = [
  { key: "new", label: "Waiting" },
  { key: "posted", label: "Posted" },
  { key: "ignored", label: "Ignored" },
  { key: "all", label: "Everything" },
] as const;

export default async function BankInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  if (!isOwner(user.role)) {
    return <EmptyState title="Bank alerts are owner-only" />;
  }

  const sp = await searchParams;
  const status = TABS.some((t) => t.key === sp.status) ? sp.status! : "new";

  const [alerts, accounts, stores] = await Promise.all([
    listBankInbox(status),
    listAccounts(true),
    listStores(),
  ]);

  return (
    <>
      <PageHeader
        title="Bank alerts"
        description="Transaction emails from the bank, waiting to be told what they were."
      />

      <div className="mb-4 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`${ROUTES.bankInbox}?status=${t.key}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
              status === t.key
                ? "border-brand font-medium text-brand"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <BankInbox alerts={alerts} accounts={accounts} branches={stores} />
    </>
  );
}
