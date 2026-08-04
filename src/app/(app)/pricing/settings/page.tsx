import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { getPricingSettings, listBands } from "@/features/pricing/queries";
import { PricingSettingsForm } from "@/features/pricing/PricingSettingsForm";
import { formatPaise } from "@/lib/money";

export const metadata: Metadata = { title: "Pricing settings" };

export default async function PricingSettingsPage() {
  const user = await requireUser();
  if (!can(user, "pricing.manage")) {
    return <EmptyState title="Pricing is owner-only" />;
  }

  const [settings, bands] = await Promise.all([getPricingSettings(), listBands()]);
  if (!settings) return <EmptyState title="Pricing settings are missing." />;

  return (
    <>
      <PageHeader
        title="Pricing settings"
        description="How a recommendation is aimed and where it is allowed to land."
        action={
          <Link
            href={ROUTES.pricing}
            className="rounded-control border border-border px-3 py-2 text-sm hover:bg-surface-sunken"
          >
            Back to pricing
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <PricingSettingsForm settings={settings} bands={bands} />

        <Card>
          <CardHeader>
            <h2 className="font-medium">The retail grid</h2>
          </CardHeader>
          <CardBody className="space-y-3 text-sm text-text-muted">
            <p>
              Every recommended price is snapped onto this grid, so the tags
              across a tray read consistently.
            </p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt>At or above {formatPaise(settings.gridSwitchPaise)}</dt>
                <dd className="tnum text-text">ends in 60</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Below {formatPaise(settings.gridSwitchPaise)}</dt>
                <dd className="tnum text-text">
                  {settings.lowEndingsPaise.map((p) => p / 100).join(" · ")}
                </dd>
              </div>
            </dl>
            <p>
              A snap that would push the price out of the chosen band is pulled
              back to the nearest grid point inside it, so the band always wins
              over the rounding.
            </p>
            <p className="border-t border-border pt-3">
              These two rows are fixed in the database rather than editable
              here. Changing a retail grid is not a settings tweak — every
              existing tag becomes inconsistent with the new one — so it is a
              deliberate migration.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
