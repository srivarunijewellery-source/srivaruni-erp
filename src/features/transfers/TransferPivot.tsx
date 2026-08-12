"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { Badge } from "@/components/ui/Badge";
import { NarrowInput, Label } from "@/components/ui/Field";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
import { ROUTES } from "@/config/nav";
import { loadPivot, loadPivotItems } from "./pivotActions";
import { STAGES, type PivotCell, type PivotFilters, type PivotItem } from "./pivotTypes";

/**
 * What is in movement, as a grid you can open.
 *
 * A bar chart says 41 Jadau pieces are moving. It cannot say WHICH, and
 * a number you cannot act on is decoration. Every figure here — cell,
 * row total, column total, grand total — opens the pieces behind it as
 * cards.
 *
 * The grid and the drill-down call the same filtered functions, so a
 * cell reading 6 opens exactly six. A pivot whose totals disagree with
 * its own drill-down is worse than no pivot, because it is believed.
 */
export function TransferPivot({
  initial,
  categories,
  styles,
  stores,
}: {
  initial: PivotCell[];
  categories: string[];
  styles: string[];
  stores: Array<{ id: string; code: string }>;
}) {
  const [filters, setFilters] = useState<PivotFilters>({
    stages: [],
    categories: [],
    styles: [],
    fromLocation: "",
    toLocation: "",
    minQty: null,
  });
  const [cells, setCells] = useState<PivotCell[]>(initial);
  const [busy, start] = useTransition();

  // What the user opened: nulls mean "everything on this axis", which is
  // how row, column and grand totals drill through one path.
  const [drill, setDrill] = useState<{
    category: string | null;
    style: string | null;
  } | null>(null);
  const [items, setItems] = useState<PivotItem[] | null>(null);

  useEffect(() => {
    start(async () => {
      const r = await loadPivot(filters);
      if (r.ok) setCells(r.data);
    });
  }, [filters]);

  const rows = useMemo(
    () => [...new Set(cells.map((c) => c.category))].sort(),
    [cells],
  );
  const cols = useMemo(() => [...new Set(cells.map((c) => c.style))].sort(), [cells]);

  const at = (cat: string, sty: string) =>
    cells.find((c) => c.category === cat && c.style === sty);

  const rowTotal = (cat: string) =>
    cells.filter((c) => c.category === cat).reduce((n, c) => n + c.pieces, 0);
  const colTotal = (sty: string) =>
    cells.filter((c) => c.style === sty).reduce((n, c) => n + c.pieces, 0);
  const grand = cells.reduce((n, c) => n + c.pieces, 0);
  const grandValue = cells.reduce((n, c) => n + c.retailPaise, 0);

  function open(category: string | null, style: string | null) {
    setDrill({ category, style });
    setItems(null);
    start(async () => {
      const r = await loadPivotItems(filters, category, style);
      setItems(r.ok ? r.data : []);
    });
  }

  const toggle = (key: keyof PivotFilters, value: string) =>
    setFilters((f) => {
      const list = f[key] as string[];
      return {
        ...f,
        [key]: list.includes(value)
          ? list.filter((x) => x !== value)
          : [...list, value],
      };
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <Chips
            label="Stage"
            options={STAGES.map((s) => ({ value: s.key, label: s.label }))}
            chosen={filters.stages}
            onToggle={(v) => toggle("stages", v)}
          />
          <Chips
            label="Style"
            options={styles.map((s) => ({ value: s, label: s }))}
            chosen={filters.styles}
            onToggle={(v) => toggle("styles", v)}
          />
          <Chips
            label="Category"
            options={categories.map((c) => ({ value: c, label: c }))}
            chosen={filters.categories}
            onToggle={(v) => toggle("categories", v)}
          />

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="from">From</Label>
              <select
                id="from"
                value={filters.fromLocation}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, fromLocation: e.target.value }))
                }
                className="h-[var(--control-height)] rounded-control border border-border bg-surface px-2 text-sm"
              >
                <option value="">Any store</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="to">To</Label>
              <select
                id="to"
                value={filters.toLocation}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, toLocation: e.target.value }))
                }
                className="h-[var(--control-height)] rounded-control border border-border bg-surface px-2 text-sm"
              >
                <option value="">Any store</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="minq">Cells with at least</Label>
              <NarrowInput
                widthClass="w-20"
                id="minq"
                type="number"
                min={0}
                value={filters.minQty ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    minQty: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                className="text-center"
              />
            </div>
            {(filters.stages.length ||
              filters.styles.length ||
              filters.categories.length ||
              filters.fromLocation ||
              filters.toLocation ||
              filters.minQty) && (
              <button
                type="button"
                onClick={() =>
                  setFilters({
                    stages: [],
                    categories: [],
                    styles: [],
                    fromLocation: "",
                    toLocation: "",
                    minQty: null,
                  })
                }
                className="pb-2 text-2xs text-brand hover:underline"
              >
                clear all
              </button>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="overflow-x-auto p-0">
          {cells.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-text-muted">
              {busy ? "Loading…" : "Nothing matches those filters."}
            </p>
          ) : (
            <table className="w-full text-2xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 bg-surface px-3 py-2 text-left">
                    Category
                  </th>
                  {cols.map((s) => (
                    <th key={s} className="px-3 py-2 text-right font-medium">
                      <button
                        type="button"
                        onClick={() => open(null, s)}
                        className="hover:text-brand hover:underline"
                      >
                        {s}
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((cat) => (
                  <tr key={cat} className="border-b border-border">
                    <td className="sticky left-0 bg-surface px-3 py-1.5">{cat}</td>
                    {cols.map((sty) => {
                      const c = at(cat, sty);
                      return (
                        <td key={sty} className="px-3 py-1.5 text-right tnum">
                          {c ? (
                            <button
                              type="button"
                              onClick={() => open(cat, sty)}
                              className="hover:text-brand hover:underline"
                              title={`${c.items} designs · ${formatPaise(c.retailPaise)}`}
                            >
                              {c.pieces}
                            </button>
                          ) : (
                            <span className="text-text-subtle">·</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right tnum font-semibold">
                      <button
                        type="button"
                        onClick={() => open(cat, null)}
                        className="hover:text-brand hover:underline"
                      >
                        {rowTotal(cat)}
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="bg-surface-sunken font-semibold">
                  <td className="sticky left-0 bg-surface-sunken px-3 py-2">Total</td>
                  {cols.map((s) => (
                    <td key={s} className="px-3 py-2 text-right tnum">
                      <button
                        type="button"
                        onClick={() => open(null, s)}
                        className="hover:text-brand hover:underline"
                      >
                        {colTotal(s)}
                      </button>
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tnum">
                    <button
                      type="button"
                      onClick={() => open(null, null)}
                      className="hover:text-brand hover:underline"
                      title={formatPaise(grandValue)}
                    >
                      {grand}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {drill && (
        <Card>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {drill.category ?? "All categories"} ·{" "}
                {drill.style ?? "All styles"}
                {items && (
                  <span className="ml-2 text-2xs font-normal text-text-muted">
                    {items.reduce((n, i) => n + i.qty, 0)} pieces across {items.length}{" "}
                    lines
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={() => setDrill(null)}
                className="text-2xs text-brand hover:underline"
              >
                close
              </button>
            </div>

            {items === null ? (
              <p className="py-6 text-center text-2xs text-text-muted">Loading…</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((i) => (
                  <Link
                    key={`${i.itemId}-${i.docNo}`}
                    href={ROUTES.productDetail(i.itemId)}
                    className="flex gap-3 rounded-card border border-border p-2 hover:border-brand"
                  >
                    <PhotoThumb src={itemPhotoUrl(i.photoPath)} alt={i.name} size={56} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-2xs font-medium">{i.name}</p>
                      <p className="truncate font-mono text-2xs text-text-muted">
                        {i.barcode}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs">
                        <Badge tone="neutral">{i.stage}</Badge>
                        <span className="tnum">{i.qty} pc</span>
                        <span className="text-text-subtle">
                          {i.fromCode}→{i.toCode}
                        </span>
                      </p>
                      <p className="font-mono text-2xs text-text-subtle">{i.docNo}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Chips({
  label,
  options,
  chosen,
  onToggle,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  chosen: string[];
  onToggle: (v: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-16 text-2xs uppercase tracking-wide text-text-subtle">
        {label}
      </span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onToggle(o.value)}
          className={`rounded-full px-2.5 py-1 text-2xs transition-colors ${
            chosen.includes(o.value)
              ? "bg-brand text-brand-fg"
              : "border border-border text-text-muted hover:border-brand"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
