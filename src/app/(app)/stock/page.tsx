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
  }>;
}) {
  const { q = "", location = "", category = "", itemType = "" } = await searchParams;

  const [rows, facets] = await Promise.all([
    searchStock(q, { location, category, itemType }),
    getStockFacets(),
  ]);

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

  const filtered = Boolean(q || location || category || itemType);
  const pieces = rows.reduce((s, r) => s + r.qty, 0);

  return (
    <>
      <PageHeader
        title="Stock"
        description="Saleable stock only. Transit and damaged pieces are excluded."
      />

      <FilterBar
        basePath={ROUTES.stock}
        value={{ q, location, category, itemType }}
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
            options: facets.categories.map((c) => ({ value: c, label: c })),
          },
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
          <p className="mb-2 text-2xs text-text-muted">
            {rows.length} row{rows.length === 1 ? "" : "s"} · {pieces} piece
            {pieces === 1 ? "" : "s"}
            {rows.length === 200 && " · showing the first 200, narrow the filters to see more"}
          </p>
          <DataTable
            columns={columns}
            rows={rows}
            getKey={(r) => `${r.itemId}-${r.locationCode}`}
          />
        </>
      )}
    </>
  );
}
