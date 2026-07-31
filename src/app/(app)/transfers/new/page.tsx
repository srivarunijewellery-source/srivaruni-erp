import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { listLocations } from "@/features/discounts/queries";
import { listPickableStock, listStockFilterOptions } from "@/features/transfers/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { StockFilterBar, type StockFilterState } from "@/features/transfers/StockFilterBar";
import { NewRequestBuilder } from "@/features/transfers/NewRequestBuilder";
import { ROUTES } from "@/config/nav";

export const metadata: Metadata = { title: "New transfer" };

/**
 * Build the whole request before it exists.
 *
 * Filters (from-store, category, type, plating, age, in-stock) live in the
 * URL and drive a fresh server-side fetch on every change. The cart itself
 * lives in NewRequestBuilder's client state, which survives that refetch
 * because the component instance is not remounted -- only its `items` prop
 * changes. The transfer row and its lines are not created until the person
 * presses "Create request".
 */
export default async function NewTransferPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [user, locations] = await Promise.all([requireUser(), listLocations()]);
  const sp = await searchParams;

  const fromLocationId = sp.from || user.locationId || locations[0]?.id || "";
  const fromLocation = locations.find((l) => l.id === fromLocationId);

  const filters: StockFilterState = {
    from: fromLocationId,
    q: sp.q ?? "",
    category: sp.category ?? "",
    itemType: sp.itemType ?? "",
    plating: sp.plating ?? "",
    inStock: sp.inStock !== "0",
    minAge: sp.minAge ?? "",
  };

  const [items, options] = fromLocationId
    ? await Promise.all([
        listPickableStock(fromLocationId, {
          query: filters.q,
          category: filters.category,
          itemType: filters.itemType,
          plating: filters.plating,
          inStockOnly: filters.inStock,
          minAgeDays: filters.minAge ? Number(filters.minAge) : undefined,
        }),
        listStockFilterOptions(fromLocationId),
      ])
    : [[], { categories: [], itemTypes: [], platings: [] }];

  return (
    <>
      <PageHeader title="New transfer" description="Select what's moving before you raise it." />

      <div className="space-y-4">
        <StockFilterBar
          basePath={ROUTES.transferNew}
          locations={locations}
          options={options}
          value={filters}
        />

        {fromLocation && (
          <NewRequestBuilder
            fromLocationId={fromLocation.id}
            fromCode={fromLocation.code}
            items={items}
            locations={locations}
          />
        )}
      </div>
    </>
  );
}
