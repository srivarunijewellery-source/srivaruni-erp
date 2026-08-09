import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterBar } from "@/components/ui/FilterBar";
import { formatPaise } from "@/lib/money";
import {
  getCustomerOverview,
  listCustomerRows,
} from "@/features/customers/queries";
import { CustomerTable } from "@/features/customers/CustomerTable";
import { MonthBars } from "@/features/customers/MonthBars";
import { VisitCohorts, SpendTrend } from "@/features/customers/CustomerInsights";
import { getVisitCohorts, getSpendByPeriod } from "@/features/customers/queries";
import { GrainPicker, defaultGrain } from "@/components/ui/GrainPicker";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { defaultTodayRange, parseDateRange, prettyDate } from "@/lib/dates";
import { isOwner } from "@/config/roles";
import type { Grain } from "@/features/dashboard/queries";
import { Button } from "@/components/ui/Button";
import { listUpcomingOccasions } from "@/features/customers/queries";

export const metadata: Metadata = { title: "Customers" };

const PAGE = 40;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; sort?: string; page?: string; from?: string; to?: string;
    grain?: string;
  }>;
}) {
  const user = await requireUser();
  if (!can(user, "customer.manage") && !can(user, "pos.sell")) {
    return <EmptyState title="You do not have access to customers" />;
  }

  const sp = await searchParams;
  const { q = "", sort = "spend", page: pageRaw = "0", from = "", to = "" } = sp;
  const page = Math.max(0, Number(pageRaw) || 0);
  const owner = isOwner(user.role);

  // Opens on today, like the rest of the app. The grain follows the
  // range unless someone has picked one — seven days wants seven bars.
  const range = parseDateRange(from, to, defaultTodayRange(), { maxDays: 800 });
  const grain = ((sp.grain as Grain) ?? defaultGrain(range.from, range.to)) as Grain;

  const [list, overview, occasions, cohorts, spend] = await Promise.all([
    listCustomerRows(q, sort, PAGE, page * PAGE, from || null, to || null),
    getCustomerOverview(),
    listUpcomingOccasions(),
    owner ? getVisitCohorts(range.from, range.to, null) : Promise.resolve([]),
    owner ? getSpendByPeriod(range.from, range.to, null, grain) : Promise.resolve([]),
  ]);

  const pages = Math.ceil(list.total / PAGE);
  const repeatPct =
    overview.withBills > 0 ? (overview.repeat / overview.withBills) * 100 : 0;

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ q, sort, from, to, page: String(page), ...over });
    for (const [k, v] of [...p.entries()]) if (!v || v === "0") p.delete(k);
    const s = p.toString();
    return s ? `${ROUTES.customers}?${s}` : ROUTES.customers;
  };

  return (
    <>
      <PageHeader
        action={
          can(user, "customer.manage") && (
            <Link href={`${ROUTES.customers}/new`}>
              <Button variant="primary">Add customer</Button>
            </Link>
          )
        }
        title="Customers"
        description="Identified by phone number, so the same person coming back lands on the same record."
      />

      {owner && (
        <section className="mb-6 space-y-3">
          <Card>
            <CardBody className="space-y-3">
              <DateRangePicker
                basePath={ROUTES.customers}
                from={range.from}
                to={range.to}
                params={{ q, sort, grain }}
                maxDays={800}
              />
              <GrainPicker
                basePath={ROUTES.customers}
                grain={grain}
                from={range.from}
                to={range.to}
              />
            </CardBody>
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex items-baseline justify-between gap-2">
                <span className="font-medium">Who came</span>
                <span className="text-2xs text-text-muted">
                  {range.from === range.to
                    ? prettyDate(range.from)
                    : `${prettyDate(range.from)} → ${prettyDate(range.to)}`}
                </span>
              </CardHeader>
              <CardBody className="p-0">
                <VisitCohorts cohorts={cohorts} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader className="flex items-baseline justify-between gap-2">
                <span className="font-medium">Average bill</span>
                <span className="text-2xs text-text-muted">
                  {spend.length} {grain === "day" ? "days" : `${grain}s`}
                </span>
              </CardHeader>
              <CardBody className="p-0">
                <SpendTrend points={spend} />
              </CardBody>
            </Card>
          </div>
        </section>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Customers" value={String(overview.total)} />
        <Metric
          label="Have bought"
          value={String(overview.withBills)}
          hint={`${overview.total - overview.withBills} never have`}
        />
        <Metric
          label="Came back"
          value={String(overview.repeat)}
          hint={`${repeatPct.toFixed(0)}% of buyers`}
        />
        <Metric
          label="Credit outstanding"
          value={formatPaise(overview.creditOut)}
          hint="notes they can still spend"
        />
      </div>

      {overview.byMonth.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="flex items-baseline justify-between gap-2">
            <span className="font-medium">Customers buying, by month</span>
            <span className="text-2xs text-text-muted">last 12 months</span>
          </CardHeader>
          <CardBody>
            {/* Bars are revenue; the number under each is how many
                different people bought. A month where revenue holds up
                on fewer customers is a different business than one where
                it holds up on more. */}
            <MonthBars
              months={overview.byMonth}
              basePath={ROUTES.customers}
              activeFrom={from}
              params={{ q, sort }}
            />
          </CardBody>
        </Card>
      )}

      {occasions.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="font-medium">
            Coming up in the next 30 days
          </CardHeader>
          <CardBody className="flex flex-wrap gap-2">
            {occasions.slice(0, 12).map((o, i) => (
              <Link
                key={`${o.customer.id}-${i}`}
                href={ROUTES.customerDetail(o.customer.id)}
                className="rounded-control border border-border px-2.5 py-1 text-2xs hover:border-brand hover:text-brand"
              >
                {o.customer.name ?? o.customer.phone}
                <span className="ml-1.5 text-text-subtle">{o.occasion}</span>
              </Link>
            ))}
          </CardBody>
        </Card>
      )}

      <FilterBar
        basePath={ROUTES.customers}
        value={{ q, sort, from, to, page: String(page) }}
        searchLabel="Find a customer"
        searchPlaceholder="Name or phone"
        selects={[
          {
            key: "sort",
            label: "Sort by",
            allLabel: "Most spent",
            options: [
              { value: "recent", label: "Most recent visit" },
              { value: "bills", label: "Most bills" },
              { value: "name", label: "Name" },
            ],
          },
        ]}
      />

      <Card>
        <CardHeader className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium">
            {list.total} customer{list.total === 1 ? "" : "s"}
          </span>
          {pages > 1 && (
            <span className="text-2xs text-text-muted">
              showing {page * PAGE + 1}&ndash;{page * PAGE + list.rows.length}
            </span>
          )}
        </CardHeader>
        <CardBody className="p-0">
          <CustomerTable rows={list.rows} />

          {pages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2">
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
