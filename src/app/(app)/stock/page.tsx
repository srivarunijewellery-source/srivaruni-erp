import type { Metadata } from "next";
import { getStockFacets, searchStock } from "@/features/stock/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import Link from "next/link";
import { Barcode } from "@/components/ui/Barcode";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { itemPhotoUrl } from "@/lib/storage";
import { ROUTES } from "@/config/nav";
import { EmptyState } from "@/components/ui/EmptyState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import { formatPaise } from "@/lib/money";
import { Pager } from "@/components/ui/Pager";
import type { StockRow } from "@/types/domain";

export const metadata: Metadata = { title: "Stock" };

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    location?: string;
    category?: string;
    itemType?: string;
    style?: string;
    view?: string;
    page?: string;
  }>;
}) {
  const {
    q = "", location = "", category = "", itemType = "", style = "", view = "",
    page: pageRaw = "0",
  } = await searchParams;

  const PAGE = 60;
  const page = Math.max(0, Number(pageRaw) || 0);

  const [result, facets] = await Promise.all([
    searchStock(q, { location, category, itemType, style }, PAGE, page * PAGE),
    getStockFacets(),
  ]);
  const rows = result.rows;
  const total = result.total;

  /** Keeps the current filters when switching view. */
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({
      q, location, category, itemType, style, view, ...over,
    })) {
      if (v) p.set(k, v);
    }
    const s2 = p.toString();
    return s2 ? `${ROUTES.stock}?${s2}` : ROUTES.stock;
  };

  const columns: ReadonlyArray<Column<StockRow>> = [
    {
      key: "photo",
      header: "",
      render: (r) => (
        <Link href={ROUTES.productDetail(r.itemId)} aria-label={r.name}>
          <PhotoThumb src={itemPhotoUrl(r.photoPath)} alt={r.name} size={36} />
        </Link>
      ),
    },
    {
      key: "barcode",
      header: "Tag",
      render: (r) => (
        <Link href={ROUTES.productDetail(r.itemId)}>
          <Barcode code={r.barcode} />
        </Link>
      ),
    },
    {
      key: "name",
      header: "Item",
      render: (r) => (
        <Link href={ROUTES.productDetail(r.itemId)} className="font-medium hover:text-brand">
          {r.name}
        </Link>
      ),
    },
    { key: "category", header: "Category", render: (r) => r.category },
    {
      key: "store",
      header: "Store",
      render: (r) => <span className="font-mono text-2xs">{r.locationCode}</span>,
    },
    { key: "qty", header: "On hand", numeric: true, render: (r) => r.qty },
    {
      key: "price",
      header: "Price",
      numeric: true,
      render: (r) => formatPaise(r.sellingPricePaise),
    },
  ];

  const filtered = Boolean(q || location || category || itemType || style);
  // Pieces on THIS page. The row total spans every page, so summing the
  // page and calling it the total would be a quietly wrong number.
  const pieces = rows.reduce((s, r) => s + r.qty, 0);

  return (
    <>
      <PageHeader
        title="Stock"
        description="Saleable stock only. Transit and damaged pieces are excluded."
      />

      <FilterBar
        basePath={ROUTES.stock}
        value={{ q, location, category, itemType, style, view }}
        searchLabel="Search name or tag"
        searchPlaceholder="Scan a tag or type an item name"
        selects={[
          {
            key: "location",
            label: "Store",
            allLabel: "All stores",
            options: facets.locations.map((l) => ({
              value: l.id,
              label: `${l.code} — ${l.name}`,
            })),
          },
          {
            key: "category",
            label: "Category",
            allLabel: "All categories",
            multi: true,
            options: facets.categories.map((c) => ({ value: c, label: c })),
          },
          ...(facets.styles.length > 0
            ? [
                {
                  key: "style" as const,
                  label: "Style",
                  allLabel: "All styles",
                  multi: true,
                  options: facets.styles.map((v) => ({ value: v, label: v })),
                },
              ]
            : []),
          // Same reasoning as the products page: no item types exist, so
          // this offered only "All types".
          ...(facets.itemTypes.length > 0
            ? [
                {
                  key: "itemType" as const,
                  label: "Item type",
                  allLabel: "All types",
                  options: facets.itemTypes.map((t) => ({ value: t, label: t })),
                },
              ]
            : []),
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "Nothing matches that" : "No stock on hand"}
          hint={
            filtered
              ? "Try a wider filter, or check the tag."
              : "Approved inward will show up here."
          }
        />
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5">
              <Link
                href={qs({ view: "" })}
                className={`rounded-full px-3 py-1.5 text-2xs ${
                  view !== "table" ? "bg-brand text-brand-fg" : "border border-border"
                }`}
              >
                Cards
              </Link>
              <Link
                href={qs({ view: "table" })}
                className={`rounded-full px-3 py-1.5 text-2xs ${
                  view === "table" ? "bg-brand text-brand-fg" : "border border-border"
                }`}
              >
                Table
              </Link>
            </div>
          </div>
          <p className="mb-2 text-2xs text-text-muted">
            {total} row{total === 1 ? "" : "s"}
            {total > PAGE &&
              ` · showing ${page * PAGE + 1}–${page * PAGE + rows.length}`}
            {" · "}
            {pieces} piece{pieces === 1 ? "" : "s"} on this page
          </p>

          <Pager
            basePath={ROUTES.stock}
            params={{ q, location, category, itemType, style, view }}
            page={page}
            pageSize={PAGE}
            total={total}
            shown={rows.length}
          />
          {/* Cards by default. Stock is looked at — you are trying to
              recognise a piece — and the table is better only when
              comparing figures down a column. */}
          {view === "table" ? (
            <DataTable
              columns={columns}
              rows={rows}
              getKey={(r) => `${r.itemId}-${r.locationCode}`}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rows.map((r) => (
                <Link
                  key={`${r.itemId}-${r.locationCode}`}
                  href={ROUTES.productDetail(r.itemId)}
                  className="flex gap-3 rounded-card border border-border bg-surface p-3 transition-colors hover:border-brand"
                >
                  <PhotoThumb src={itemPhotoUrl(r.photoPath)} alt={r.name} size={72} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="truncate font-mono text-2xs text-text-muted">
                      {r.barcode} · {r.category}
                    </p>
                    {r.style && r.style !== "Not set" && (
                      <p className="truncate text-2xs text-text-subtle">{r.style}</p>
                    )}
                    <p className="tnum mt-1 text-sm">
                      {r.sellingPricePaise === null
                        ? "not priced"
                        : formatPaise(r.sellingPricePaise)}
                    </p>
                    <p className="text-2xs text-text-muted">
                      {r.qty} on hand · {r.locationCode}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="mt-4">
            <Pager
              basePath={ROUTES.stock}
              params={{ q, location, category, itemType, style, view }}
              page={page}
              pageSize={PAGE}
              total={total}
              shown={rows.length}
            />
          </div>
        </>
      )}
    </>
  );
}
