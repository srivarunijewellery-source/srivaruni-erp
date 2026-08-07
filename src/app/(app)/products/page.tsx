import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { listProducts } from "@/features/products/queries";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterBar } from "@/components/ui/FilterBar";
import { ProductsTable } from "@/features/products/ProductsTable";
import { NewProductDialog } from "@/features/products/NewProductDialog";
import {
  listCategories,
  listItemFormOptions,
  listStores,
} from "@/features/inward/queries";
import { listVendorOptions } from "@/features/vendors/queries";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    itemType?: string;
    plating?: string;
    stone?: string;
    vendor?: string;
    status?: string;
    location?: string;
    stock?: string;
  }>;
}) {
  const {
    q = "",
    category = "",
    itemType = "",
    plating = "",
    stone = "",
    vendor = "",
    status = "",
    location = "",
    stock = "",
  } = await searchParams;

  const user = await requireUser();
  const [rows, categories, options, stores, vendors] = await Promise.all([
    listProducts(q, {
      categoryId: category,
      itemTypeId: itemType,
      platingId: plating,
      stoneId: stone,
      vendorId: vendor,
      status,
      locationId: location,
      stock,
    }),
    listCategories(),
    listItemFormOptions(),
    listStores(),
    listVendorOptions(),
  ]);

  // Pricing columns are owner-only. The database enforces the same rule:
  // item_costs is owner-only via RLS, and items_pricing_guard rejects a
  // price change from anyone else.
  const canEditPricing = can(user, "cost.view");

  // Types belong to a category, so offering all of them beside a chosen
  // category would list combinations that cannot exist.
  const types = category
    ? options.itemTypes.filter((t) => t.categoryId === category)
    : options.itemTypes;

  const filtered = Boolean(
    q || category || itemType || plating || stone || vendor || status || location || stock,
  );

  return (
    <>
      <PageHeader
        action={
          <NewProductDialog
            categories={categories}
            options={options}
            canSetPricing={canEditPricing}
          />
        }
        title="Products"
        description={
          canEditPricing
            ? "Every SKU ever received. Open one to edit its details."
            : "Every SKU ever received. Open one to see its details."
        }
      />

      <FilterBar
        basePath={ROUTES.products}
        value={{ q, category, itemType, plating, stone, vendor, status, location, stock }}
        searchLabel="Search name or tag"
        searchPlaceholder="Scan a tag or type an item name"
        selects={[
          {
            key: "location",
            label: "Held at",
            allLabel: "Any store",
            options: stores.map((s) => ({
              value: s.id,
              label: `${s.code} — ${s.name}`,
            })),
          },
          {
            key: "category",
            label: "Category",
            allLabel: "All categories",
            options: categories.map((c) => ({ value: c.id, label: c.name })),
          },
          {
            key: "itemType",
            label: "Item type",
            allLabel: "All types",
            options: types.map((t) => ({ value: t.id, label: t.name })),
          },
          {
            key: "plating",
            label: "Plating",
            allLabel: "All plating",
            options: options.platings.map((p) => ({ value: p.id, label: p.value })),
          },
          {
            key: "stone",
            label: "Stone",
            allLabel: "All stones",
            options: options.stones.map((o) => ({ value: o.id, label: o.value })),
          },
          {
            key: "vendor",
            label: "Vendor",
            allLabel: "All vendors",
            options: vendors.map((v) => ({ value: v.id, label: v.name })),
          },
          {
            key: "stock",
            label: "On hand",
            allLabel: "Anything",
            options: [
              { value: "in", label: "In stock somewhere" },
              { value: "out", label: "Nothing left" },
            ],
          },
          {
            key: "status",
            label: "Status",
            allLabel: "Any status",
            options: [
              { value: "pending_pricing", label: "Awaiting pricing" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "discontinued", label: "Discontinued" },
            ],
          },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "Nothing matches that" : "No products yet"}
          hint={
            filtered
              ? "Try a wider filter, or check the tag."
              : "Items appear here as soon as they are added to an inward, before pricing."
          }
        />
      ) : (
        <>
          <p className="mb-2 text-2xs text-text-muted">
            {rows.length} product{rows.length === 1 ? "" : "s"}
            {rows.length === 200 && " · showing the first 200, narrow the filters to see more"}
          </p>
          <ProductsTable rows={rows} showPricing={canEditPricing} />
        </>
      )}
    </>
  );
}
