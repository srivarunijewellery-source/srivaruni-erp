import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardBody } from "@/components/ui/Card";
import { listBands, listPricingRows, getPricingSettings } from "@/features/pricing/queries";
import { PricingWorkbench } from "@/features/pricing/PricingWorkbench";
import { formatBps } from "@/lib/pricing";

export const metadata: Metadata = { title: "Pricing" };

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const user = await requireUser();

  if (!can(user.role, "pricing.manage")) {
    return (
      <EmptyState
        title="Pricing is owner-only"
        hint="This screen works from landed cost, which is not visible to other roles."
      />
    );
  }

  const sp = await searchParams;
  const showAll = sp.status === "all";

  const [rows, bands, settings] = await Promise.all([
    listPricingRows({ status: showAll ? "all" : "pending", search: sp.q }),
    listBands(),
    getPricingSettings(),
  ]);

  const defaultBand = bands.find((b) => b.id === settings?.defaultBandId);

  return (
    <>
      <PageHeader
        title="Pricing"
        description="Choose a margin band; the price follows from landed cost and lands on the retail grid."
        action={
          <div className="flex gap-2">
            <Link
              href={ROUTES.pricingRules}
              className="rounded-control border border-border px-3 py-2 text-sm hover:bg-surface-sunken"
            >
              Rules
            </Link>
            <Link
              href={ROUTES.pricingSettings}
              className="rounded-control border border-border px-3 py-2 text-sm hover:bg-surface-sunken"
            >
              Settings
            </Link>
          </div>
        }
      />

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="text-text-muted">
            Margin is measured on the tag price,{" "}
            {settings?.marginIncludesGst ? "GST included" : "excluding GST"}.
          </span>
          <span className="text-text-muted">
            Target: band midpoint
            {settings && settings.targetNudgeBps !== 0
              ? ` ${settings.targetNudgeBps > 0 ? "+" : ""}${formatBps(settings.targetNudgeBps)}`
              : ""}
            .
          </span>
          {defaultBand && (
            <span className="text-text-muted">
              Fallback band: <span className="text-text">{defaultBand.label}</span>
            </span>
          )}
          <Link
            href={showAll ? ROUTES.pricing : `${ROUTES.pricing}?status=all`}
            className="ml-auto underline decoration-dotted underline-offset-2 hover:text-brand"
          >
            {showAll ? "Show only unpriced" : "Show everything, including priced stock"}
          </Link>
        </CardBody>
      </Card>

      <PricingWorkbench rows={rows} bands={bands} />
    </>
  );
}
