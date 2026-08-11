import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { listProducts } from "@/features/products/queries";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterBar } from "@/components/ui/FilterBar";
import { ProductsTable } from "@/features/products/ProductsTable";
import { ProductGrid } from "@/features/products/ProductGrid";
import { PriceRangeFilter } from "@/components/ui/PriceRangeFilter";
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
    page?: string;
    location?: string;
    stock?: string;
    minPrice?: string;
    maxPrice?: string;
    view?: string;
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
    page: pageRaw = "0",
    location = "",
    stock = "",
    minPrice = "",
    maxPrice = "",
    view = "",
  } = await searchParams;

  const user = await requireUser();
  const PAGE = 60;
  const page = Math.max(0, Number(pageRaw) || 0);

  const [result, categories, options, stores, vendors] = await Promise.all([
    listProducts(q, {
      categoryId: category,
      itemTypeId: itemType,
      platingId: plating,
      stoneId: stone,
      vendorId: vendor,
      status,
      locationId: location,
      stock,
      // Typed in rupees in the URL so a shared link stays readable.
      minPricePaise: minPrice ? Number(minPrice) * 100 : undefined,
      maxPricePaise: maxPrice ? Number(maxPrice) * 100 : undefined,
    }, PAGE, page * PAGE),
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

  // The slider track spans what the catalogue actually contains, rounded
  // up to a clean thousand. A fixed ceiling would either cut off the
  // expensive pieces or leave most of the track empty.
  const priceCeilingPaise = Math.max(
    100000,
    Math.ceil((result.maxSellingPricePaise ?? 3200000) / 100000) * 100000,
  );

  const rows = result.rows;
  const total = result.total;
  const pages = Math.ceil(total / PAGE);

  // Keeps every filter when stepping pages, and drops page when a filter
  // changes — landing on page 7 of a 2-page result reads as "no matches".
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({
      q, category, itemType, plating, stone, vendor, status, location, stock,
      minPrice, maxPrice, view,
      page: String(page), ...over,
    });
    for (const [k, v] of [...p.entries()]) if (!v || (k === "page" && v === "0")) p.delete(k);
    const str = p.toString();
    return str ? `${ROUTES.products}?${str}` : ROUTES.products;
  };

  // Five pages around the current one. A full list at 110 pages is
  // unusable, and stepping is far more common than jumping.
  const pageWindow = Array.from({ length: pages }, (_, i) => i).filter(
    (n) => Math.abs(n - page) <= 2,
  );

  const filtered = Boolean(
    q || category || itemType || plating || stone || vendor || status || location ||
      stock || minPrice || maxPrice,
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
        value={{ q, category, itemType, plating, stone, vendor, status, location, stock,
                 minPrice, maxPrice, view, page: String(page) }}
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
          // Omitted when nothing is defined: a filter offering only
          // "All types" is a control that cannot do anything.
          ...(types.length > 0
            ? [
                {
                  key: "itemType" as const,
                  label: "Item type",
                  allLabel: "All types",
                  options: types.map((t) => ({ value: t.id, label: t.name })),
                },
              ]
            : []),
          {
            key: "plating",
            label: "Plating",
            allLabel: "All plating",
            options: options.platings.map((p) => ({ value: p.id, label: p.value })),
          },
          {
            key: "stone",
            label: "Style",
            allLabel: "All styles",
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

      <div className="mb-3 flex flex-wrap items-end justify-between gap-4">
        <PriceRangeFilter
          basePath={ROUTES.products}
          params={{ q, category, itemType, plating, stone, vendor, status, location, stock, view }}
          minPaise={minPrice ? Number(minPrice) * 100 : null}
          maxPaise={maxPrice ? Number(maxPrice) * 100 : null}
          floorPaise={0}
          ceilingPaise={priceCeilingPaise}
        />

        {/* Cards by default; the table is still there for anyone
            comparing figures down a column. */}
        <div className="flex gap-1.5">
          <Link
            href={qs({ view: "", page: "0" })}
            className={`rounded-full px-3 py-1.5 text-2xs ${
              view !== "table" ? "bg-brand text-brand-fg" : "border border-border"
            }`}
          >
            Cards
          </Link>
          <Link
            href={qs({ view: "table", page: "0" })}
            className={`rounded-full px-3 py-1.5 text-2xs ${
              view === "table" ? "bg-brand text-brand-fg" : "border border-border"
            }`}
          >
            Table
          </Link>
        </div>
      </div>

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
            {total} product{total === 1 ? "" : "s"}
            {pages > 1 &&
              ` · showing ${page * PAGE + 1}\u2013${page * PAGE + rows.length}`}
          </p>

          {view === "table" ? (
            <ProductsTable rows={rows} showPricing={canEditPricing} />
          ) : (
            <ProductGrid rows={rows} />
          )}

          {pages > 1 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-2xs text-text-muted">
                Page {page + 1} of {pages}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {page > 0 && (
                  <Link
                    href={qs({ page: String(page - 1) })}
                    className="rounded-control border border-border px-3 py-1.5 text-2xs hover:border-brand hover:text-brand"
                  >
                    Previous
                  </Link>
                )}
                {/* Numbered pages, windowed around the current one: at
                    110 pages a full list is unusable, and jumping to a
                    far page is rare compared with stepping. */}
                {pageWindow.map((n) => (
                  <Link
                    key={n}
                    href={qs({ page: String(n) })}
                    className={`rounded-control border px-2.5 py-1.5 text-2xs ${
                      n === page
                        ? "border-brand bg-brand text-brand-fg"
                        : "border-border hover:border-brand hover:text-brand"
                    }`}
                  >
                    {n + 1}
                  </Link>
                ))}
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
        </>
      )}
    </>
  );
}
