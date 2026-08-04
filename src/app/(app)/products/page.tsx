import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { listProducts } from "@/features/products/queries";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Field";
import { ProductsTable } from "@/features/products/ProductsTable";
import { NewProductDialog } from "@/features/products/NewProductDialog";
import { listCategories, listItemFormOptions } from "@/features/inward/queries";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const user = await requireUser();
  const [rows, categories, options] = await Promise.all([
    listProducts(q),
    listCategories(),
    listItemFormOptions(),
  ]);

  // Pricing columns are owner-only. The database enforces the same rule:
  // item_costs is owner-only via RLS, and items_pricing_guard rejects a
  // price change from anyone else.
  const canEditPricing = can(user, "inward.viewCost");

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

      <form className="mb-4" role="search">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Scan a tag or type an item name"
          aria-label="Search products"
          className="max-w-md"
        />
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title={q ? `Nothing matches “${q}”` : "No products yet"}
          hint={
            q
              ? "Check the tag, or try part of the item name."
              : "Items appear here as soon as they are added to an inward, before pricing."
          }
        />
      ) : (
        <ProductsTable rows={rows} showPricing={canEditPricing} />
      )}
    </>
  );
}
