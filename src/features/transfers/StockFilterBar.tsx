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
  /** Pieces on hand, as a FLOOR — "3 or more". Exact match hid every
   *  four and five, and depth is what the question is about. */
  qty: string;
  /** Nothing already committed to another transfer. */
  freeOnly: boolean;
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
    if (merged.freeOnly) params.set("freeOnly", "1");
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
            <Label htmlFor="stone">Style</Label>
            <Select
              id="stone"
              value={value.stone}
              onChange={(e) => apply({ stone: e.target.value })}
              disabled={options.stones.length === 0}
            >
              <option value="">
                {options.stones.length === 0 ? "Not set on any item" : "All styles"}
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
                  {n} or more
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

        <label className="flex items-center gap-1.5 text-2xs">
          <input
            type="checkbox"
            checked={value.freeOnly}
            onChange={(e) => apply({ freeOnly: e.target.checked })}
          />
          only pieces not already on a transfer
        </label>

        <ExcludeControl
          groups={[
            {
              key: "exCategories",
              label: "categories",
              all: options.categories,
              chosen: value.exCategories,
            },
            { key: "exStones", label: "styles", all: options.stones, chosen: value.exStones },
            {
              key: "exPlatings",
              label: "plating",
              all: options.platings,
              chosen: value.exPlatings,
            },
          ]}
          onChange={(key, next) => apply({ [key]: next } as Partial<StockFilterState>)}
        />

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



type ExcludeKey = "exCategories" | "exStones" | "exPlatings";

interface ExcludeGroup {
  key: ExcludeKey;
  label: string;
  all: string[];
  chosen: string[];
}

/**
 * Exclusions, folded away until wanted.
 *
 * The first cut printed every value as a chip: sixty categories, thirteen
 * stones and every plating, all on screen at once, above the grid they
 * were meant to filter. It buried the thing being filtered.
 *
 * So: one line by default. What is currently excluded shows as struck
 * chips — because an exclusion you have forgotten about looks exactly
 * like missing stock, and it has to stay visible. Everything else lives
 * behind a button, in a scrollable panel with a search box, since sixty
 * categories is a list to search rather than a set to scan.
 */
function ExcludeControl({
  groups,
  onChange,
}: {
  groups: ExcludeGroup[];
  onChange: (key: ExcludeKey, next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState("");

  const active = groups.flatMap((g) =>
    g.chosen.map((v) => ({ key: g.key, value: v, chosen: g.chosen })),
  );
  const usable = groups.filter((g) => g.all.length > 0);
  if (usable.length === 0) return null;

  const needle = find.trim().toLowerCase();

  return (
    <div className="border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-control border border-border px-3 py-1.5 text-2xs hover:border-brand hover:text-brand"
        >
          {open ? "Done" : "Exclude…"}
        </button>

        {active.length === 0 ? (
          <span className="text-2xs text-text-subtle">
            nothing excluded
          </span>
        ) : (
          <>
            {active.map(({ key, value, chosen }) => (
              <button
                key={`${key}-${value}`}
                type="button"
                title="Remove this exclusion"
                onClick={() => onChange(key, chosen.filter((x) => x !== value))}
                className="rounded-full bg-status-danger-bg px-2.5 py-1 text-2xs text-status-danger-fg line-through"
              >
                {value}
              </button>
            ))}
            <button
              type="button"
              onClick={() => groups.forEach((g) => g.chosen.length && onChange(g.key, []))}
              className="ml-1 text-2xs text-brand hover:underline"
            >
              clear all
            </button>
          </>
        )}
      </div>

      {open && (
        <div className="mt-2 rounded-control border border-border p-2">
          <Input
            autoFocus
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="Find a category, style or plating"
            className="h-9 w-full"
          />
          <div className="mt-2 max-h-64 space-y-3 overflow-auto">
            {usable.map((g) => {
              const shown = g.all.filter(
                (v) => !needle || v.toLowerCase().includes(needle),
              );
              if (shown.length === 0) return null;
              return (
                <div key={g.key}>
                  <p className="mb-1 text-2xs uppercase tracking-wide text-text-subtle">
                    {g.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {shown.map((v) => {
                      const on = g.chosen.includes(v);
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() =>
                            onChange(
                              g.key,
                              on ? g.chosen.filter((x) => x !== v) : [...g.chosen, v],
                            )
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
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
