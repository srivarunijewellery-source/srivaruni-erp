import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getDiscountSettings } from "@/features/discounts/queries";
import { DiscountSettingsForm } from "@/features/discounts/SettingsForm";

export const metadata: Metadata = { title: "Discount settings" };

export default async function DiscountSettingsPage() {
  const user = await requireUser();
  if (!can(user, "discount.manage")) {
    return <EmptyState title="Discounts are owner-only" />;
  }

  const settings = await getDiscountSettings();
  if (!settings) return <EmptyState title="Discount settings are missing." />;

  return (
    <>
      <PageHeader
        title="Discount settings"
        description="The rules every offer and every counter decision has to obey."
        action={
          <Link
            href={ROUTES.discounts}
            className="rounded-control border border-border px-3 py-2 text-sm hover:bg-surface-sunken"
          >
            Back to discounts
          </Link>
        }
      />
      <DiscountSettingsForm settings={settings} />
    </>
  );
}
