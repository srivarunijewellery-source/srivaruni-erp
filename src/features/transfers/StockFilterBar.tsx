"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select, Label } from "@/components/ui/Field";
import type { StockFilterOptions, StoreLocation } from "@/types/domain";

export interface StockFilterState {
  from: string;
  q: string;
  category: string;
  itemType: string;
  plating: string;
  inStock: boolean;
  minAge: string;
}

/**
 * Filters live in the URL, not component state.
 *
 * Changing a filter is a real navigation (router.push), which re-runs the
 * server component and refetches the item list for the new criteria. The
 * cart above this bar is a separate client component instance that is not
 * remounted by that navigation, so switching from "in stock only" to "show
 * everything" never loses what has already been picked.
 */
export function StockFilterBar({
  basePath,
  locations,
  options,
  value,
  lockFrom,
}: {
  basePath: string;
  locations: StoreLocation[];
  options: StockFilterOptions;
  value: StockFilterState;
  /** Hides the store selector, for filtering within an already-fixed source. */
  lockFrom?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState(value.q);

  function apply(next: Partial<StockFilterState>) {
    const merged = { ...value, ...next };
    const params = new URLSearchParams();
    params.set("from", merged.from);
    if (merged.q.trim()) params.set("q", merged.q.trim());
    if (merged.category) params.set("category", merged.category);
    if (merged.itemType) params.set("itemType", merged.itemType);
    if (merged.plating) params.set("plating", merged.plating);
    if (merged.minAge) params.set("minAge", merged.minAge);
    if (!merged.inStock) params.set("inStock", "0");
    router.push(`${basePath}?${params.toString()}`);
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {!lockFrom && (
            <div>
              <Label htmlFor="src">Sending store</Label>
              <Select
                id="src"
                value={value.from}
                onChange={(e) => apply({ from: e.target.value })}
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} — {l.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="cat">Category</Label>
            <Select
              id="cat"
              value={value.category}
              onChange={(e) => apply({ category: e.target.value })}
            >
              <option value="">All categories</option>
              {options.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="type">Item type</Label>
            <Select
              id="type"
              value={value.itemType}
              onChange={(e) => apply({ itemType: e.target.value })}
              disabled={options.itemTypes.length === 0}
            >
              <option value="">
                {options.itemTypes.length === 0 ? "Not set on any item" : "All types"}
              </option>
              {options.itemTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="plating">Plating</Label>
            <Select
              id="plating"
              value={value.plating}
              onChange={(e) => apply({ plating: e.target.value })}
              disabled={options.platings.length === 0}
            >
              <option value="">
                {options.platings.length === 0 ? "Not set on any item" : "All plating"}
              </option>
              {options.platings.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="age">Sitting here since</Label>
            <Select
              id="age"
              value={value.minAge}
              onChange={(e) => apply({ minAge: e.target.value })}
            >
              <option value="">Any age</option>
              <option value="30">30+ days</option>
              <option value="60">60+ days</option>
              <option value="90">90+ days</option>
              <option value="180">180+ days</option>
            </Select>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q });
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="min-w-48 flex-1">
            <Label htmlFor="q">Search name or barcode</Label>
            <Input id="q" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>

          <label className="ml-auto flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.inStock}
              onChange={(e) => apply({ inStock: e.target.checked })}
              className="h-4 w-4 rounded border-border"
            />
            Only items with stock here
          </label>

          {(value.q || value.category || value.itemType || value.plating || value.minAge) && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQ("");
                router.push(`${basePath}?from=${value.from}`);
              }}
            >
              Clear filters
            </Button>
          )}
        </form>
      </CardBody>
    </Card>
  );
}
