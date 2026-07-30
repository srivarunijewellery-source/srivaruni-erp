import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Field";
import {
  listBands, listPricingRows, getPricingSettings, countInwardsAwaitingPricing,
  listRuleScopeOptions,
} from "@/features/pricing/queries";
import { PricingWorkbench } from "@/features/pricing/PricingWorkbench";
import { formatBps } from "@/lib/pricing";

export const metadata: Metadata = { title: "Pricing" };

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string; q?: string; category?: string; vendor?: string;
  }>;
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
  const status =
    sp.status === "pending" || sp.status === "priced" ? sp.status : "all";
  const showAll = status === "all";

  const [rows, bands, settings, awaitingInwards, scope] = await Promise.all([
    listPricingRows({
      status,
      search: sp.q,
      categoryId: sp.category,
      vendorId: sp.vendor,
    }),
    listBands(),
    getPricingSettings(),
    countInwardsAwaitingPricing(),
    listRuleScopeOptions(),
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
        </CardBody>
      </Card>

      {/* Filters as a GET form: the state lives in the URL, so a filtered
          view can be bookmarked and survives the revalidation that follows
          every price change. */}
      <Card className="mt-3">
        <CardBody>
          <form className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="f-q">Search</Label>
              <Input
                id="f-q" name="q" defaultValue={sp.q ?? ""}
                placeholder="name or tag"
              />
            </div>
            <div>
              <Label htmlFor="f-status">Show</Label>
              <Select id="f-status" name="status" defaultValue={status}>
                <option value="all">Everything</option>
                <option value="pending">Unpriced only</option>
                <option value="priced">Priced only</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="f-cat">Category</Label>
              <Select id="f-cat" name="category" defaultValue={sp.category ?? ""}>
                <option value="">Any category</option>
                {scope.categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="f-vendor">Vendor</Label>
              <Select id="f-vendor" name="vendor" defaultValue={sp.vendor ?? ""}>
                <option value="">Any vendor</option>
                {scope.vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </Select>
            </div>
            <Button type="submit">Filter</Button>
            <Link
              href={ROUTES.pricing}
              className="px-2 py-2 text-sm text-text-muted underline decoration-dotted underline-offset-2 hover:text-brand"
            >
              Clear
            </Link>
          </form>
        </CardBody>
      </Card>

      {/* An empty list here nearly always means the items exist but have
          no landed cost yet, because their inward has not been priced and
          approved. Saying "nothing to price" would read as a fault in this
          screen when the work is actually one screen upstream. */}
      {rows.length === 0 ? (
        <EmptyState
          title={
            showAll
              ? "No stock has a landed cost yet"
              : "Nothing is waiting to be priced"
          }
          hint={
            awaitingInwards > 0
              ? `An item can only be priced once its inward is priced and approved — that is what works out its landed cost. ${awaitingInwards} ${awaitingInwards === 1 ? "inward is" : "inwards are"} still awaiting pricing. Enter the rates there first; the band and the suggested MRP are on that screen too.`
              : "Items appear here once their inward has been priced and approved, which is what gives them a landed cost to price against."
          }
        />
      ) : (
        <PricingWorkbench rows={rows} bands={bands} />
      )}
    </>
  );
}
