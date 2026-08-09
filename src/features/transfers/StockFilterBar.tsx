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
  stone: string;
  /** Exactly this many on the shelf, as a string because it comes from
   *  the URL. Empty means any. */
  qty: string;
  /** Everything EXCEPT these. Multi-value, because "not rings and not
   *  bangles" is one thought, and forcing it through repeated single
   *  selects is how people give up and scroll instead. */
  exCategories: string[];
  exStones: string[];
  exPlatings: string[];
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
    if (merged.stone) params.set("stone", merged.stone);
    if (merged.qty) params.set("qty", merged.qty);
    // Comma-joined so the URL stays readable and shareable.
    if (merged.exCategories.length) params.set("exCategories", merged.exCategories.join(","));
    if (merged.exStones.length) params.set("exStones", merged.exStones.join(","));
    if (merged.exPlatings.length) params.set("exPlatings", merged.exPlatings.join(","));
    if (merged.minAge) params.set("minAge", merged.minAge);
    if (!merged.inStock) params.set("inStock", "0");
    // Any filter change invalidates the page number: page 4 of the old
    // result set is meaningless against the new one, and usually empty.
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
            <Label htmlFor="stone">Stone</Label>
            <Select
              id="stone"
              value={value.stone}
              onChange={(e) => apply({ stone: e.target.value })}
              disabled={options.stones.length === 0}
            >
              <option value="">
                {options.stones.length === 0 ? "Not set on any item" : "All stones"}
              </option>
              {options.stones.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="qty">Pieces on hand</Label>
            <Select
              id="qty"
              value={value.qty}
              onChange={(e) => apply({ qty: e.target.value })}
            >
              <option value="">Any quantity</option>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={String(n)}>
                  exactly {n}
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

        <ExcludeRow
          label="Exclude categories"
          all={options.categories}
          chosen={value.exCategories}
          onChange={(next) => apply({ exCategories: next })}
        />
        <ExcludeRow
          label="Exclude stones"
          all={options.stones}
          chosen={value.exStones}
          onChange={(next) => apply({ exStones: next })}
        />
        <ExcludeRow
          label="Exclude plating"
          all={options.platings}
          chosen={value.exPlatings}
          onChange={(next) => apply({ exPlatings: next })}
        />

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


/**
 * Toggle chips for "everything except these".
 *
 * Chips rather than a multi-select: what is excluded has to be visible
 * at a glance, because an exclusion you have forgotten about looks
 * exactly like missing stock. A struck-through chip says so; a collapsed
 * multi-select showing "3 selected" does not.
 *
 * Hidden entirely when there is nothing to exclude, so a store with no
 * stones recorded does not carry a dead row.
 */
function ExcludeRow({
  label,
  all,
  chosen,
  onChange,
}: {
  label: string;
  all: string[];
  chosen: string[];
  onChange: (next: string[]) => void;
}) {
  if (all.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-2xs uppercase tracking-wide text-text-subtle">
        {label}
      </span>
      {all.map((v) => {
        const on = chosen.includes(v);
        return (
          <button
            key={v}
            type="button"
            onClick={() =>
              onChange(on ? chosen.filter((x) => x !== v) : [...chosen, v])
            }
            className={`rounded-full px-2.5 py-1 text-2xs transition-colors ${
              on
                ? "bg-status-danger-bg text-status-danger-fg line-through"
                : "border border-border text-text-muted hover:border-brand"
            }`}
          >
            {v}
          </button>
        );
      })}
      {chosen.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="ml-1 text-2xs text-brand hover:underline"
        >
          clear
        </button>
      )}
    </div>
  );
}
