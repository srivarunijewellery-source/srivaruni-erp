import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { createClient } from "@/lib/supabase/server";
import {
  listAccounts,
  listExpenses,
  listPaymentAccounts,
  listTaxRates,
} from "@/features/accounting/queries";
import { listLocationOptions } from "@/features/staff/queries";
import { ExpenseManager } from "@/features/accounting/ExpenseManager";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage() {
  const user = await requireUser();
  if (!can(user.role, "accounts.manage")) {
    return <EmptyState title="Expenses are owner-only" />;
  }

  const supabase = await createClient();
  const [expenses, categories, taxRates, locations, paymentAccounts, vendorRes] =
    await Promise.all([
      listExpenses(),
      listAccounts(true),
      listTaxRates(),
      listLocationOptions(),
      listPaymentAccounts(),
      supabase.from("vendors").select("id, name").eq("active", true).order("name"),
    ]);

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Everything the business spends that is not stock. Each one posts to the books as it is saved."
      />
      <ExpenseManager
        expenses={expenses}
        categories={categories}
        taxRates={taxRates}
        locations={locations}
        paymentAccounts={paymentAccounts}
        vendors={vendorRes.data ?? []}
      />
    </>
  );
}
