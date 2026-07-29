import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { listBands, listRules, listRuleScopeOptions } from "@/features/pricing/queries";
import { RulesEditor } from "@/features/pricing/RulesEditor";

export const metadata: Metadata = { title: "Pricing rules" };

export default async function PricingRulesPage() {
  const user = await requireUser();
  if (!can(user.role, "pricing.manage")) {
    return <EmptyState title="Pricing is owner-only" />;
  }

  const [rules, bands, scope] = await Promise.all([
    listRules(),
    listBands(),
    listRuleScopeOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Pricing rules"
        description="Which margin band governs which stock, so pricing a carton is one click."
        action={
          <Link
            href={ROUTES.pricing}
            className="rounded-control border border-border px-3 py-2 text-sm hover:bg-surface-sunken"
          >
            Back to pricing
          </Link>
        }
      />
      <RulesEditor
        rules={rules}
        bands={bands}
        categories={scope.categories}
        itemTypes={scope.itemTypes}
        vendors={scope.vendors}
      />
    </>
  );
}
