import type { Metadata } from "next";
import { searchStock } from "@/features/stock/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import Link from "next/link";
import { Barcode } from "@/components/ui/Barcode";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { itemPhotoUrl } from "@/lib/storage";
import { ROUTES } from "@/config/nav";
import { EmptyState } from "@/components/ui/EmptyState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Field";
import { formatPaise } from "@/lib/money";
import type { StockRow } from "@/types/domain";

export const metadata: Metadata = { title: "Stock" };

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const rows = await searchStock(q);

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
    { key: "store", header: "Store", render: (r) => <span className="font-mono text-2xs">{r.locationCode}</span> },
    { key: "qty", header: "On hand", numeric: true, render: (r) => r.qty },
    { key: "price", header: "Price", numeric: true, render: (r) => formatPaise(r.sellingPricePaise) },
  ];

  return (
    <>
      <PageHeader title="Stock" description="Saleable stock only. Transit and damaged pieces are excluded." />

      <form className="mb-4" role="search">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Scan a tag or type an item name"
          aria-label="Search stock"
          autoFocus
          className="max-w-md"
        />
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title={q ? `Nothing matches “${q}”` : "No stock on hand"}
          hint={q ? "Check the tag, or try part of the item name." : "Approved inward will show up here."}
        />
      ) : (
        <DataTable columns={columns} rows={rows} getKey={(r) => `${r.itemId}-${r.locationCode}`} />
      )}
    </>
  );
}
