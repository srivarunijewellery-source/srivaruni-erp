import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { formatPaise } from "@/lib/money";
import { formatBps } from "@/lib/pricing";
import { formatDate } from "@/lib/format";
import {
  getDiscountSettings, listLocations, listSchemes, listSellableItems,
} from "@/features/discounts/queries";
import { listRuleScopeOptions } from "@/features/pricing/queries";
import { SchemeForm } from "@/features/discounts/SchemeForm";
import { Simulator } from "@/features/discounts/Simulator";

export const metadata: Metadata = { title: "Discounts" };

export default async function DiscountsPage() {
  const user = await requireUser();
  if (!can(user.role, "discount.manage")) {
    return (
      <EmptyState
        title="Discounts are owner-only"
        hint="Offers are checked against landed cost, which other roles cannot see."
      />
    );
  }

  const [schemes, settings, locations, scope, items] = await Promise.all([
    listSchemes(),
    getDiscountSettings(),
    listLocations(),
    listRuleScopeOptions(),
    listSellableItems(),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Discounts"
        description="Offers, the guardrails around them, and a basket to test both."
        action={
          <Link
            href={ROUTES.discountSettings}
            className="rounded-control border border-border px-3 py-2 text-sm hover:bg-surface-sunken"
          >
            Settings
          </Link>
        }
      />

      <Card className="mb-4 border-status-pending-bg bg-status-pending-bg/40">
        <CardBody className="text-sm">
          <strong className="font-medium">There is no till yet.</strong>{" "}
          Offers defined here are live configuration, not decoration — the
          resolver below is the one a POS will call, and every guardrail is
          enforced in the database. Until billing exists, nothing consumes them
          automatically, so use the basket to check an offer behaves before a
          festival, not after.
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader><h2 className="font-medium">Offers</h2></CardHeader>
            <CardBody className="p-0">
              {schemes.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-text-muted">
                  No offers yet.
                </p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-sunken text-2xs uppercase tracking-wide text-text-muted">
                      <th className="px-3 py-1.5 text-left">Offer</th>
                      <th className="px-3 py-1.5 text-left">Covers</th>
                      <th className="px-3 py-1.5 text-right">Value</th>
                      <th className="px-3 py-1.5 text-left">Window</th>
                      <th className="px-3 py-1.5 text-left">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schemes.map((s) => {
                      const live = s.active && s.startsOn <= today && s.endsOn >= today;
                      const done = s.endsOn < today;
                      return (
                        <tr key={s.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">
                            <div className="font-medium">{s.name}</div>
                            <div className="text-2xs text-text-muted">
                              {s.scope === "invoice" ? "Whole bill" : "Product selection"}
                              {s.minBillPaise > 0 && ` · over ${formatPaise(s.minBillPaise)}`}
                              {s.maxDiscountPaise && ` · capped at ${formatPaise(s.maxDiscountPaise)}`}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {s.scope === "invoice" ? (
                                <Tag muted>Every bill</Tag>
                              ) : s.targets.length === 0 ? (
                                <Tag muted>Everything</Tag>
                              ) : (
                                s.targets.map((t) => (
                                  <Tag key={t.id}>
                                    {[t.vendorName, t.categoryName, t.itemTypeName, t.itemName]
                                      .filter(Boolean).join(" · ")}
                                  </Tag>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="tnum px-3 py-2 text-right">
                            {s.valueKind === "percent"
                              ? formatBps(s.valueBps, 0)
                              : formatPaise(s.valuePaise)}
                          </td>
                          <td className="px-3 py-2 text-2xs text-text-muted">
                            {formatDate(s.startsOn)} – {formatDate(s.endsOn)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={live ? "done" : done ? "neutral" : "pending"}>
                              {live ? "Running" : done ? "Finished" : "Scheduled"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>

          <Simulator items={items} locations={locations} />
        </div>

        <SchemeForm
          categories={scope.categories}
          itemTypes={scope.itemTypes}
          vendors={scope.vendors}
          locations={locations}
          maxPercentBps={settings?.maxPercentOwnerBps ?? 5000}
          maxDays={settings?.maxCampaignDays ?? 60}
        />
      </div>
    </>
  );
}
