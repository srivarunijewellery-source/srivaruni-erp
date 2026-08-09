import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { listInwards, listStores } from "@/features/inward/queries";
import { listTransfers } from "@/features/transfers/queries";
import { can, isOwner } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { INWARD_STATUS, TRANSFER_STATUS } from "@/config/status";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDate, pluralise } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { defaultTodayRange, parseDateRange } from "@/lib/dates";
import { getDaySummary, getStockValue } from "@/features/today/queries";
import { TodayFilters } from "@/features/today/TodayFilters";
import { getItemsSold } from "@/features/dashboard/queries";
import { SoldItemsGrid } from "@/features/dashboard/SoldItemsGrid";

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    location?: string;
    view?: string;
  }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const owner = isOwner(user.role);

  const [inwards, transfers] = await Promise.all([listInwards(), listTransfers()]);
  const awaitingPricing = inwards.filter((i) => i.status === "submitted");
  const awaitingApproval = transfers.filter((t) => t.status === "requested");
  const inTransit = transfers.filter((t) => t.status === "dispatched");
  const queue = can(user, "inward.approve") ? awaitingPricing : [];

  // Everything in the money band is owner-only. The RPCs behind it raise
  // for anyone else, so this decides what is RENDERED and the database
  // decides what is answerable -- two independent gates, deliberately.
  const range = parseDateRange(sp.from, sp.to, defaultTodayRange(), { maxDays: 400 });
  const locationId = sp.location || null;
  const showSold = owner && sp.view === "sold";

  const [branches, day, stock, sold] = await Promise.all([
    owner ? listStores() : Promise.resolve([]),
    owner ? getDaySummary(range.from, range.to, locationId) : Promise.resolve(null),
    owner ? getStockValue(locationId) : Promise.resolve(null),
    showSold
      ? getItemsSold(range.from, range.to, locationId, {}, 48, 0)
      : Promise.resolve(null),
  ]);

  const marginPct =
    day && day.revenuePaise > 0 ? (day.marginPaise / day.revenuePaise) * 100 : null;
  // Per bill, not per customer: someone who came back the same day spent
  // twice, and averaging that away hides the second visit.
  const avgBill = day && day.bills > 0 ? Math.round(day.revenuePaise / day.bills) : 0;

  const qs = new URLSearchParams();
  qs.set("from", range.from);
  qs.set("to", range.to);
  if (locationId) qs.set("location", locationId);

  return (
    <>
      <PageHeader
        title={`Good day, ${user.name}`}
        description={
          user.locationCode
            ? `Signed in at ${user.locationCode}.`
            : "Signed in across all locations."
        }
      />

      {owner && day && stock && (
        <section className="mb-6 space-y-3">
          <TodayFilters
            from={range.from}
            to={range.to}
            locationId={sp.location ?? ""}
            branches={branches.map((b) => ({ id: b.id, code: b.code, name: b.name }))}
          />

          {range.adjusted && (
            <p className="rounded-control border border-status-pending-fg/40 bg-status-pending-bg px-3 py-2 text-sm">
              {range.adjusted}
            </p>
          )}

          {/* Revenue is the one you tap, so it gets its own full-width
              card and says where it goes. */}
          <Link
            href={`/?${qs.toString()}&view=sold`}
            className="block rounded-card border border-border bg-surface p-4 transition-colors hover:border-brand active:border-brand"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm text-text-muted">Revenue</p>
              <span className="text-2xs text-brand">what sold &rarr;</span>
            </div>
            <p className="tnum mt-1 text-3xl font-semibold tracking-tight">
              {formatPaise(day.revenuePaise)}
            </p>
            <p className="mt-0.5 text-2xs text-text-muted">
              {day.bills} {pluralise(day.bills, "bill")} · {day.pieces}{" "}
              {pluralise(day.pieces, "piece")}
            </p>
          </Link>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Figure
              label="Profit"
              value={formatPaise(day.marginPaise)}
              hint={marginPct === null ? "no sales yet" : `${marginPct.toFixed(1)}% margin`}
              tone={day.marginPaise < 0 ? "danger" : "good"}
            />
            <Figure
              label="Discounts given"
              value={formatPaise(day.discountPaise)}
              hint={
                day.revenuePaise + day.discountPaise > 0
                  ? `${((day.discountPaise / (day.revenuePaise + day.discountPaise)) * 100).toFixed(1)}% of gross`
                  : undefined
              }
            />
            <Figure
              label="Customers"
              value={String(day.customers)}
              hint={
                day.walkins > 0
                  ? `plus ${day.walkins} walk-in${day.walkins === 1 ? "" : "s"}`
                  : "unique, counted once each"
              }
            />
            <Figure
              label="Average bill"
              value={formatPaise(avgBill)}
              hint={day.bills > 0 ? `across ${day.bills} bills` : "no sales yet"}
            />
            <Figure
              label="Cost of goods sold"
              value={formatPaise(day.costPaise)}
              hint="at landed cost"
            />
            <Figure
              label="Returns"
              value={formatPaise(day.returnsPaise)}
              hint={`${day.returnsCount} ${pluralise(day.returnsCount, "note")}`}
              tone={day.returnsPaise > 0 ? "danger" : undefined}
            />
          </div>

          {/* Stock is a position, not a flow: it is what sits on the shelf
              now, so the dates above deliberately do not touch it. Saying
              so stops it being misread as stock sold. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Figure
              label="Stock at cost"
              value={formatPaise(stock.costPaise)}
              hint={`${stock.pieces} pieces on hand`}
            />
            <Figure
              label="Stock at retail"
              value={formatPaise(stock.retailPaise)}
              hint={`${stock.items} designs`}
            />
            <div className="col-span-2 flex items-center rounded-card border border-dashed border-border px-3 py-2">
              <p className="text-2xs text-text-muted">
                Stock is counted as it stands now, not for the dates above.
                {locationId ? " This branch only." : " Across every branch."}
              </p>
            </div>
          </div>

          {showSold && sold && (
            <Card>
              <CardHeader className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">What sold, best first</span>
                <div className="flex items-center gap-3">
                  <span className="text-2xs text-text-muted">
                    {sold.total === 0
                      ? "nothing matches"
                      : `top ${sold.items.length} of ${sold.total}`}
                  </span>
                  <Link href={`/?${qs.toString()}`} className="text-2xs text-brand">
                    close
                  </Link>
                </div>
              </CardHeader>
              <CardBody className="p-0">
                <SoldItemsGrid items={sold.items} />
                {sold.total > sold.items.length && (
                  <div className="border-t border-border px-3 py-2 text-center">
                    <Link
                      href={`${ROUTES.insights}?tab=items&${qs.toString()}`}
                      className="text-sm text-brand"
                    >
                      Open the full view, with filters and paging
                    </Link>
                  </div>
                )}
              </CardBody>
            </Card>
          )}
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Awaiting pricing" value={awaitingPricing.length} href={ROUTES.inward} />
        <Stat label="Transfers to approve" value={awaitingApproval.length} href={ROUTES.transfers} />
        <Stat label="In transit" value={inTransit.length} href={ROUTES.transfers} />
      </div>

      {can(user, "inward.approve") && (
        <Card className="mt-6">
          <CardHeader>
            <h2 className="font-medium">Your approval queue</h2>
          </CardHeader>
          <CardBody>
            {queue.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-muted">
                Nothing waiting on you. Stock stays unsellable until you price it.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {queue.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={ROUTES.inwardDetail(i.id)}
                        className="font-mono text-sm hover:text-brand"
                      >
                        {i.docNo}
                      </Link>
                      <p className="truncate text-sm text-text-muted">
                        {i.vendorName} · {i.lineCount} {pluralise(i.lineCount, "line")} ·{" "}
                        {i.totalQty} {pluralise(i.totalQty, "piece")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-2xs text-text-subtle">
                        {formatDate(i.submittedAt)}
                      </span>
                      <Badge tone={INWARD_STATUS[i.status].tone}>
                        {INWARD_STATUS[i.status].label}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader>
          <h2 className="font-medium">Transfers in flight</h2>
        </CardHeader>
        <CardBody>
          {inTransit.length === 0 ? (
            <p className="py-4 text-center text-sm text-text-muted">Nothing on the road.</p>
          ) : (
            <ul className="divide-y divide-border">
              {inTransit.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <span className="font-mono text-sm">{t.docNo}</span>
                    <p className="text-sm text-text-muted">
                      {t.fromCode} → {t.toCode} · {t.qtySent}{" "}
                      {pluralise(t.qtySent, "piece")}
                    </p>
                  </div>
                  <Badge tone={TRANSFER_STATUS[t.status].tone}>
                    {TRANSFER_STATUS[t.status].label}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "danger";
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-3">
      <p className="text-2xs uppercase tracking-wide text-text-subtle">{label}</p>
      <p
        className={`tnum mt-1 text-xl font-semibold tracking-tight sm:text-2xl ${
          tone === "danger"
            ? "text-status-danger-fg"
            : tone === "good"
              ? "text-status-done-fg"
              : ""
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-2xs text-text-muted">{hint}</p>}
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="block">
      <Card className="transition-shadow hover:shadow-raised">
        <CardBody>
          <p className="text-sm text-text-muted">{label}</p>
          <p className="tnum mt-1 text-3xl font-semibold tracking-tight">{value}</p>
        </CardBody>
      </Card>
    </Link>
  );
}
