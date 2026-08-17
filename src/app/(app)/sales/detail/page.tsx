import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FilterBar } from "@/components/ui/FilterBar";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { Pager } from "@/components/ui/Pager";
import { ItemLink } from "@/components/ui/ItemLink";
import { formatPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { parseDateRange, defaultMonthRange } from "@/lib/dates";
import { ROUTES } from "@/config/nav";
import {
  listSalesLines,
  summariseSalesLines,
  GROUPINGS,
} from "@/features/salesdetail/queries";
import { getStockFacets } from "@/features/stock/queries";
import { listStores } from "@/features/inward/queries";
import { listSellers } from "@/features/pos/queries";

export const metadata: Metadata = { title: "Sales detail" };

const PAGE = 200;

export default async function SalesDetailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "cost.view")) {
    return <EmptyState title="Sales detail is owner-only" />;
  }

  const sp = await searchParams;
  const range = parseDateRange(sp.from, sp.to, defaultMonthRange(), { maxDays: 400 });
  const page = Math.max(0, Number(sp.page) || 0);
  const groupBy = GROUPINGS.some((g) => g.key === sp.groupBy)
    ? (sp.groupBy as string)
    : "category";

  const filters = {
    location: sp.location ?? "",
    soldBy: sp.soldBy ?? "",
    category: sp.category ?? "",
    style: sp.style ?? "",
    exCategory: sp.exCategory ?? "",
    vendor: sp.vendor ?? "",
    q: sp.q ?? "",
  };

  const [result, buckets, facets, stores, sellers] = await Promise.all([
    listSalesLines(range.from, range.to, filters, PAGE, page * PAGE),
    summariseSalesLines(range.from, range.to, filters, groupBy),
    getStockFacets(),
    listStores(),
    listSellers(user.locationId ?? ""),
  ]);

  const rows = result.rows;
  const sold = buckets.reduce((n, b) => n + b.soldPaise, 0);
  const margin = buckets.reduce((n, b) => n + b.marginPaise, 0);
  const pieces = buckets.reduce((n, b) => n + b.pieces, 0);

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({
      from: range.from, to: range.to, ...filters, groupBy, ...over,
    })) {
      if (v) p.set(k, v);
    }
    return `${ROUTES.salesDetail}?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Sales detail"
        description="Every line sold, with the filters to cut it however you need."
      />

      <div className="mb-3">
        <DateRangePicker
          basePath={ROUTES.salesDetail}
          from={range.from}
          to={range.to}
          params={{ ...filters, groupBy }}
          maxDays={400}
        />
      </div>

      <FilterBar
        basePath={ROUTES.salesDetail}
        searchKey="q"
        searchLabel="Item, tag, bill or customer"
        value={{ ...filters, from: range.from, to: range.to, groupBy }}
        selects={[
          {
            key: "location",
            label: "Branch",
            allLabel: "Both branches",
            options: stores.map((s) => ({ value: s.id, label: s.name })),
          },
          {
            key: "soldBy",
            label: "Salesman",
            allLabel: "Everyone",
            options: sellers.map((s) => ({ value: s.id, label: s.name })),
          },
          {
            key: "category",
            label: "Category",
            allLabel: "All categories",
            multi: true,
            options: facets.categories.map((c) => ({ value: c, label: c })),
          },
          {
            key: "exCategory",
            label: "Leave out",
            allLabel: "Nothing excluded",
            multi: true,
            exclude: true,
            options: facets.categories.map((c) => ({ value: c, label: c })),
          },
          {
            key: "style",
            label: "Style",
            allLabel: "All styles",
            multi: true,
            options: facets.styles.map((s) => ({ value: s, label: s })),
          },
          ...(facets.vendors.length > 0
            ? [
                {
                  key: "vendor" as const,
                  label: "Vendor",
                  allLabel: "All vendors",
                  options: facets.vendors.map((v) => ({ value: v, label: v })),
                },
              ]
            : []),
        ]}
      />

      {/* Totals first: the shape of the answer before the detail. */}
      <div className="my-4 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-2xs text-text-muted">Sold</p>
            <p className="tnum text-lg font-medium">{formatPaise(sold)}</p>
            <p className="text-2xs text-text-subtle">
              {result.total} lines · {pieces} pieces
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-2xs text-text-muted">Margin</p>
            <p className="tnum text-lg font-medium">{formatPaise(margin)}</p>
            <p className="text-2xs text-text-subtle">
              {sold > 0 ? ((100 * margin) / sold).toFixed(1) : "0.0"}% of the sale
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-2xs text-text-muted">Average line</p>
            <p className="tnum text-lg font-medium">
              {formatPaise(result.total > 0 ? Math.round(sold / result.total) : 0)}
            </p>
          </CardBody>
        </Card>
      </div>

      {/* The same slice, cut whichever way answers the question. */}
      <Card className="mb-4">
        <CardHeader className="flex flex-wrap items-center gap-1.5">
          <span className="mr-2 font-medium">Grouped by</span>
          {GROUPINGS.map((g) => (
            <Link
              key={g.key}
              href={qs({ groupBy: g.key })}
              className={`rounded-full px-2.5 py-1 text-2xs ${
                groupBy === g.key
                  ? "bg-brand text-brand-fg"
                  : "border border-border text-text-muted"
              }`}
            >
              {g.label}
            </Link>
          ))}
        </CardHeader>
        <CardBody className="p-0">
          <table className="w-full text-2xs">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2">Group</th>
                <th className="px-2 py-2 text-right">Lines</th>
                <th className="px-2 py-2 text-right">Pieces</th>
                <th className="px-2 py-2 text-right">Sold</th>
                <th className="px-2 py-2 text-right">Margin</th>
                <th className="px-2 py-2 text-right">Margin %</th>
                <th className="px-4 py-2 text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.bucket} className="border-b border-border">
                  <td className="px-4 py-1.5">{b.bucket}</td>
                  <td className="tnum px-2 py-1.5 text-right">{b.lines}</td>
                  <td className="tnum px-2 py-1.5 text-right">{b.pieces}</td>
                  <td className="tnum px-2 py-1.5 text-right">
                    {formatPaise(b.soldPaise)}
                  </td>
                  <td className="tnum px-2 py-1.5 text-right">
                    {formatPaise(b.marginPaise)}
                  </td>
                  <td className="tnum px-2 py-1.5 text-right text-text-muted">
                    {b.marginBps === null ? "—" : `${(b.marginBps / 100).toFixed(1)}%`}
                  </td>
                  <td className="tnum px-4 py-1.5 text-right text-text-subtle">
                    {(b.shareBps / 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="Nothing sold matches those filters" />
      ) : (
        <>
          <Pager
            basePath={ROUTES.salesDetail}
            params={{ from: range.from, to: range.to, ...filters, groupBy }}
            page={page}
            pageSize={PAGE}
            total={result.total}
            shown={rows.length}
          />

          <Card>
            <CardBody className="overflow-x-auto p-0">
              <table className="w-full text-2xs">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-2 py-2">Bill</th>
                    <th className="px-2 py-2">Item</th>
                    <th className="px-2 py-2">Category</th>
                    <th className="px-2 py-2">Salesman</th>
                    <th className="px-2 py-2">Customer</th>
                    <th className="px-2 py-2 text-right">Qty</th>
                    <th className="px-2 py-2 text-right">Sold</th>
                    <th className="px-2 py-2 text-right">Margin</th>
                    <th className="px-3 py-2 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.billId}-${r.itemId}-${i}`} className="border-b border-border">
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {formatDate(r.billDate)}
                      </td>
                      <td className="px-2 py-1.5">
                        <Link
                          href={`${ROUTES.sales}?q=${encodeURIComponent(r.billNo)}`}
                          className="font-mono text-brand hover:underline"
                        >
                          {r.billNo}
                        </Link>
                        <span className="ml-1 text-text-subtle">{r.locationCode}</span>
                      </td>
                      <td className="max-w-56 truncate px-2 py-1.5">
                        <ItemLink itemId={r.itemId} name={r.itemName} />
                        <span className="ml-1 font-mono text-text-subtle">
                          {r.barcode}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-text-muted">{r.category}</td>
                      <td className="px-2 py-1.5">{r.salesman}</td>
                      <td className="px-2 py-1.5 text-text-muted">
                        {r.customerName ?? (
                          <span className="text-text-subtle">walk-in</span>
                        )}
                      </td>
                      <td className="tnum px-2 py-1.5 text-right">{r.qty}</td>
                      <td className="tnum px-2 py-1.5 text-right">
                        {formatPaise(r.lineTotalPaise)}
                      </td>
                      <td className="tnum px-2 py-1.5 text-right">
                        {formatPaise(r.marginPaise)}
                      </td>
                      <td className="tnum px-3 py-1.5 text-right text-text-muted">
                        {r.marginBps === null ? "—" : (r.marginBps / 100).toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </>
      )}
    </>
  );
}
