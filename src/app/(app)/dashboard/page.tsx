import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { isOwner } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterBar } from "@/components/ui/FilterBar";
import { formatPaise } from "@/lib/money";
import { listStores, listItemFormOptions } from "@/features/inward/queries";
import { listVendorOptions } from "@/features/vendors/queries";
import { DateRangeBar } from "@/features/dashboard/DateRangeBar";
import {
  DIMENSIONS,
  getExpensePivot,
  getBenefitsGiven,
  getItemsSold,
  getSalesByPeriod,
  getSalesPivot,
  type Dimension,
  type Grain,
} from "@/features/dashboard/queries";
import { TrendChart } from "@/features/dashboard/TrendChart";
import { PivotTable } from "@/features/dashboard/PivotTable";
import { SoldItemsGrid } from "@/features/dashboard/SoldItemsGrid";
import { isoOf, todayIso } from "@/lib/dates";

export const metadata: Metadata = { title: "Dashboard" };

const GRAINS: Grain[] = ["day", "week", "month", "year"];
const TABS = [
  { key: "sales", label: "Sales" },
  { key: "expenses", label: "Expenses" },
  { key: "items", label: "What sold" },
  { key: "benefits", label: "Given away" },
] as const;

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  return isoOf(d);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    from?: string;
    to?: string;
    location?: string;
    dimension?: string;
    grain?: string;
    icat?: string;
    istone?: string;
    ivendor?: string;
    isearch?: string;
    isort?: string;
    page?: string;
  }>;
}) {
  const user = await requireUser();

  // Owner only, and checked here as well as in every RPC. The functions
  // carry their own is_owner() guard, so a missing check in this file
  // would show an empty page rather than leak a figure.
  if (!isOwner(user.role)) {
    return (
      <EmptyState
        title="The dashboard is owner-only"
        hint="It shows cost and margin across every branch."
      />
    );
  }

  const sp = await searchParams;
  const tab =
    sp.tab === "expenses" || sp.tab === "benefits" || sp.tab === "items"
      ? sp.tab
      : "sales";
  // Twelve months, not five.
  //
  // A five-month default silently hid everything before March and made a
  // freshly migrated database look half empty -- the data was all there,
  // the window was just too narrow to show it. A year is the span an
  // owner actually thinks in, and it covers a full festive cycle.
  const from = sp.from || monthsAgo(12);
  const to = sp.to || todayIso();
  const location = sp.location || "";
  const grain = (GRAINS.includes(sp.grain as Grain) ? sp.grain : "month") as Grain;
  const dimension = (DIMENSIONS.some((d) => d.key === sp.dimension)
    ? sp.dimension
    : "category") as Dimension;

  const loc = location || null;

  const itemFilters = {
    category: sp.icat ?? "",
    stone: sp.istone ?? "",
    vendor: sp.ivendor ?? "",
    search: sp.isearch ?? "",
    sort: sp.isort ?? "revenue",
  };
  const PAGE = 48;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);

  const [stores, points, salesPivot, expensePivot, benefits, sold, itemOptions, vendors] =
    await Promise.all([
    listStores(),
    tab === "sales" ? getSalesByPeriod(from, to, loc, grain) : Promise.resolve([]),
    tab === "sales"
      ? getSalesPivot(from, to, dimension, loc)
      : Promise.resolve({ months: [], rows: [], totals: {}, grandTotalPaise: 0 }),
    tab === "expenses"
      ? getExpensePivot(from, to, loc)
      : Promise.resolve({ months: [], rows: [], totals: {}, grandTotalPaise: 0 }),
    tab === "benefits" ? getBenefitsGiven(from, to, loc) : Promise.resolve([]),
    tab === "items"
      ? getItemsSold(from, to, loc, itemFilters, PAGE, page * PAGE)
      : Promise.resolve({
          items: [], total: 0, totalRevenuePaise: 0,
          totalMarginPaise: 0, totalQty: 0, totalSoldOut: 0,
        }),
    tab === "items" ? listItemFormOptions() : Promise.resolve(null),
    tab === "items" ? listVendorOptions() : Promise.resolve([]),
  ]);

  const soldItems = sold.items;
  const soldTotal = sold.total;
  const pages = Math.ceil(soldTotal / PAGE);

  // What each kind of giveaway actually cost. A coupon and a discount
  // cost their face value; a gift costs what the piece cost us, which is
  // a very different number from what it would have sold for.
  const givenBy = (k: string) => benefits.filter((b) => b.kind === k);
  const sumValue = (k: string) =>
    givenBy(k).reduce((s, b) => s + b.valuePaise, 0);
  const giftCost = givenBy("gift").reduce((s, b) => s + b.costPaise, 0);
  const givenTotalCost = sumValue("coupon") + sumValue("discount") + giftCost;

  const revenue = points.reduce((s, p) => s + p.revenuePaise, 0);
  const margin = points.reduce((s, p) => s + p.marginPaise, 0);
  const bills = points.reduce((s, p) => s + p.bills, 0);
  const pieces = points.reduce((s, p) => s + p.qty, 0);
  const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
  const spend = expensePivot.grandTotalPaise;

  const qs = (over: Record<string, string>) => {
    const params = new URLSearchParams({
      tab, from, to, location, dimension, grain,
      icat: itemFilters.category, istone: itemFilters.stone,
      ivendor: itemFilters.vendor, isearch: itemFilters.search,
      isort: itemFilters.sort,
      ...over,
    });
    for (const [k, v] of [...params.entries()]) if (!v) params.delete(k);
    return `${ROUTES.insights}?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Where the money came from and where it went. Owner only."
      />

      <div className="mb-4 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={qs({ tab: t.key })}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
              tab === t.key
                ? "border-brand font-medium text-brand"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <DateRangeBar
        basePath={ROUTES.insights}
        params={{ tab, location, dimension, grain, ...(tab === "items"
          ? { icat: itemFilters.category, istone: itemFilters.stone,
              ivendor: itemFilters.vendor, isearch: itemFilters.search,
              isort: itemFilters.sort }
          : {}) }}
        from={from}
        to={to}
      />

      <FilterBar
        basePath={ROUTES.insights}
        value={{
          tab, from, to, location, dimension, grain,
          icat: itemFilters.category, istone: itemFilters.stone,
          ivendor: itemFilters.vendor, isearch: itemFilters.search,
          isort: itemFilters.sort,
        }}
        searchKey={tab === "items" ? "isearch" : "_unused"}
        searchLabel={tab === "items" ? "Find a piece" : "Search"}
        searchPlaceholder={tab === "items" ? "Name or tag" : undefined}
        selects={[
          {
            key: "location",
            label: "Branch",
            allLabel: "All branches",
            options: stores.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })),
          },
          ...(tab === "items" && itemOptions
            ? [
                {
                  key: "icat",
                  label: "Category",
                  allLabel: "All categories",
                  options: itemOptions.categories.map((c) => ({
                    value: c.id,
                    label: c.name,
                  })),
                },
                {
                  key: "istone",
                  label: "Stone",
                  allLabel: "All stones",
                  options: itemOptions.stones.map((o) => ({
                    value: o.id,
                    label: o.value,
                  })),
                },
                {
                  key: "ivendor",
                  label: "Vendor",
                  allLabel: "All vendors",
                  options: vendors.map((v) => ({ value: v.id, label: v.name })),
                },
                {
                  key: "isort",
                  label: "Sort by",
                  allLabel: "Revenue",
                  options: [
                    { value: "qty", label: "Pieces sold" },
                    { value: "margin", label: "Margin" },
                  ],
                },
              ]
            : []),
          ...(tab === "sales"
            ? [
                {
                  key: "grain",
                  label: "Group by",
                  allLabel: "Month",
                  options: GRAINS.map((g) => ({ value: g, label: g })),
                },
                {
                  key: "dimension",
                  label: "Break down by",
                  allLabel: "Category",
                  options: DIMENSIONS.map((d) => ({ value: d.key, label: d.label })),
                },
              ]
            : []),
        ]}
      />

      {tab === "sales" ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Revenue" value={formatPaise(revenue)} hint={`${bills} bills`} />
            <Metric
              label="Margin"
              value={formatPaise(margin)}
              hint={`${marginPct.toFixed(1)}% · revenue less landed cost`}
            />
            <Metric
              label="Average bill"
              value={formatPaise(bills > 0 ? Math.round(revenue / bills) : 0)}
              hint={`${pieces} pieces`}
            />
            <Metric
              label="Pieces per bill"
              value={bills > 0 ? (pieces / bills).toFixed(1) : "—"}
              hint="how much goes in a bag"
            />
          </div>

          <Card className="mb-4">
            <CardHeader className="font-medium">Revenue and margin</CardHeader>
            <CardBody className="p-0">
              <TrendChart points={points} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">
                By {DIMENSIONS.find((d) => d.key === dimension)?.label.toLowerCase()}
              </span>
              <span className="text-2xs text-text-muted">
                cancelled bills excluded
              </span>
            </CardHeader>
            <CardBody className="p-0">
              <PivotTable
                pivot={salesPivot}
                label={DIMENSIONS.find((d) => d.key === dimension)?.label ?? "Category"}
                showMargin
              />
            </CardBody>
          </Card>
        </>
      ) : tab === "items" ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* All four describe every matching piece, not the page. */}
            <Metric
              label="Pieces sold"
              value={String(sold.totalQty)}
              hint={`${soldTotal} different designs`}
            />
            <Metric label="Revenue" value={formatPaise(sold.totalRevenuePaise)} />
            <Metric
              label="Margin"
              value={formatPaise(sold.totalMarginPaise)}
              hint={
                sold.totalRevenuePaise > 0
                  ? `${((sold.totalMarginPaise / sold.totalRevenuePaise) * 100).toFixed(1)}%`
                  : undefined
              }
            />
            <Metric
              label="Sold out"
              value={String(sold.totalSoldOut)}
              hint="designs with none left"
            />
          </div>

          <Card>
            <CardHeader className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">What sold, best first</span>
              <span className="text-2xs text-text-muted">
                {soldTotal === 0
                  ? "nothing matches"
                  : `showing ${page * PAGE + 1}\u2013${page * PAGE + soldItems.length} of ${soldTotal}`}
              </span>
            </CardHeader>
            <CardBody className="p-0">
              <SoldItemsGrid items={soldItems} />
              {pages > 1 && (
                <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
                  <span className="text-2xs text-text-muted">
                    Page {page + 1} of {pages}
                  </span>
                  <div className="flex gap-2">
                    {page > 0 && (
                      <Link
                        href={qs({ page: String(page - 1) })}
                        className="rounded-control border border-border px-3 py-1.5 text-2xs hover:border-brand hover:text-brand"
                      >
                        Previous
                      </Link>
                    )}
                    {page + 1 < pages && (
                      <Link
                        href={qs({ page: String(page + 1) })}
                        className="rounded-control border border-border px-3 py-1.5 text-2xs hover:border-brand hover:text-brand"
                      >
                        Next
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      ) : tab === "benefits" ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Given away"
              value={formatPaise(givenTotalCost)}
              hint="what it cost us"
            />
            <Metric
              label="Discounts"
              value={formatPaise(sumValue("discount"))}
              hint={`${givenBy("discount").length} bills`}
            />
            <Metric
              label="Coupons"
              value={formatPaise(sumValue("coupon"))}
              hint={`${givenBy("coupon").length} redeemed`}
            />
            <Metric
              label="Gifts"
              value={formatPaise(giftCost)}
              hint={`${givenBy("gift").length} given · ${formatPaise(sumValue("gift"))} at tag price`}
            />
          </div>

          <Card>
            <CardHeader className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">Every cut given</span>
              <span className="text-2xs text-text-muted">
                newest first · {benefits.length} in this window
              </span>
            </CardHeader>
            <CardBody className="p-0">
              {benefits.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-text-muted">
                  Nothing was given away in this window.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-sunken">
                        {["What", "Offer", "Bill", "Customer", "Branch", "Sold by", "Value", "Cost"].map(
                          (h) => (
                            <th
                              key={h}
                              className={`px-3 py-2 text-2xs font-medium uppercase tracking-wide text-text-muted ${
                                h === "Value" || h === "Cost" ? "text-right" : "text-left"
                              }`}
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {benefits.slice(0, 200).map((b, i) => (
                        <tr key={`${b.billId}-${b.kind}-${i}`} className="border-b border-border">
                          <td className="px-3 py-2">
                            <Badge
                              tone={
                                b.kind === "gift"
                                  ? "done"
                                  : b.kind === "coupon"
                                    ? "pending"
                                    : "neutral"
                              }
                            >
                              {b.kind}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">{b.name}</td>
                          <td className="px-3 py-2">
                            <Link
                              href={ROUTES.billDetail(b.billId)}
                              className="font-mono text-2xs hover:text-brand hover:underline"
                            >
                              {b.billNo}
                            </Link>
                          </td>
                          <td className="px-3 py-2">
                            {b.customerId ? (
                              <Link
                                href={ROUTES.customerDetail(b.customerId)}
                                className="hover:text-brand hover:underline"
                              >
                                {b.customerName ?? b.customerPhone}
                              </Link>
                            ) : (
                              <span className="text-text-subtle">Walk-in</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-2xs">{b.locationCode}</td>
                          <td className="px-3 py-2 text-2xs">{b.staffName}</td>
                          <td className="tnum px-3 py-2 text-right font-mono">
                            {formatPaise(b.valuePaise)}
                          </td>
                          <td className="tnum px-3 py-2 text-right font-mono text-2xs text-text-muted">
                            {b.kind === "gift" ? formatPaise(b.costPaise) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Metric label="Spent" value={formatPaise(spend)} hint="in this window" />
            <Metric
              label="Heads"
              value={String(expensePivot.rows.length)}
              hint="expense accounts used"
            />
            <Metric
              label="Biggest head"
              value={expensePivot.rows[0]?.dimension ?? "—"}
              hint={
                expensePivot.rows[0]
                  ? formatPaise(expensePivot.rows[0].totalRevenuePaise)
                  : undefined
              }
            />
          </div>

          <Card>
            <CardHeader className="font-medium">Expenses by head</CardHeader>
            <CardBody className="p-0">
              <PivotTable pivot={expensePivot} label="Account" />
            </CardBody>
          </Card>
        </>
      )}
    </>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardBody>
        <p className="text-2xs uppercase tracking-wide text-text-muted">{label}</p>
        <p className="tnum font-mono text-2xl">{value}</p>
        {hint && <p className="text-2xs text-text-subtle">{hint}</p>}
      </CardBody>
    </Card>
  );
}
