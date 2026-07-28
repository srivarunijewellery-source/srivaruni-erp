"use client";

import { useState, useTransition } from "react";
import { updateProduct } from "./actions";
import { updateItemAttributes } from "@/features/inward/pricingActions";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { Barcode } from "@/components/ui/Barcode";
import { Badge } from "@/components/ui/Badge";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise, parseRupeesToPaise } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { ProductRow } from "./queries";
import type { Category, ItemFormOptions } from "@/types/domain";

const STATUS_TONE = {
  pending_pricing: "pending",
  active: "done",
  inactive: "neutral",
  discontinued: "neutral",
} as const;

const STATUS_LABEL = {
  pending_pricing: "Awaiting pricing",
  active: "Active",
  inactive: "Inactive",
  discontinued: "Discontinued",
} as const;

export function ProductsTable({
  rows,
  categories,
  options,
  canEditPricing,
}: {
  rows: ProductRow[];
  categories: Category[];
  options: ItemFormOptions;
  canEditPricing: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-sunken">
            {["", "Tag", "Item", "Category", "Colour", "Plating", "Stone", "Status", "On hand"].map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wide text-text-muted"
              >
                {h}
              </th>
            ))}
            {canEditPricing && (
              <>
                <th className="px-3 py-2 text-right text-2xs font-semibold uppercase tracking-wide text-text-muted">
                  Cost
                </th>
                <th className="px-3 py-2 text-right text-2xs font-semibold uppercase tracking-wide text-text-muted">
                  MRP
                </th>
                <th className="px-3 py-2 text-right text-2xs font-semibold uppercase tracking-wide text-text-muted">
                  Selling
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row
              key={row.id}
              row={row}
              categories={categories}
              options={options}
              canEditPricing={canEditPricing}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  row,
  categories,
  options,
  canEditPricing,
}: {
  row: ProductRow;
  categories: Category[];
  options: ItemFormOptions;
  canEditPricing: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (field: string, value: string) =>
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("itemId", row.id);
      fd.set(field, value);
      const result = await updateProduct(fd);
      if (!result.ok) setError(result.error);
    });

  const saveAttr = (field: string, value: string) =>
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("itemId", row.id);
      fd.set("inwardId", "00000000-0000-0000-0000-000000000000");
      fd.set("colourId",  field === "colourId"  ? value : (row.colourId ?? ""));
      fd.set("platingId", field === "platingId" ? value : (row.platingId ?? ""));
      fd.set("stoneId",   field === "stoneId"   ? value : (row.stoneId ?? ""));
      fd.set("sizeId",    field === "sizeId"    ? value : (row.sizeId ?? ""));
      const result = await updateItemAttributes(fd);
      if (!result.ok) setError(result.error);
    });

  const savePrice = (field: "mrpPaise" | "sellingPricePaise", input: string) => {
    const paise = parseRupeesToPaise(input);
    if (paise === null) {
      setError("Enter an amount like 1299 or 1299.50");
      return;
    }
    save(field, String(paise));
  };

  return (
    <tr className={cn("border-b border-border last:border-0", pending && "opacity-60")}>
      <td className="px-3 py-2">
        <PhotoThumb src={itemPhotoUrl(row.photoPath)} alt={row.name} />
      </td>
      <td className="px-3 py-2 align-middle">
        <Barcode code={row.barcode} />
      </td>
      <td className="px-3 py-2 align-middle">
        <input
          defaultValue={row.name}
          onBlur={(e) => e.target.value !== row.name && save("name", e.target.value)}
          aria-label="Item name"
          className="w-full min-w-[12rem] rounded-control border border-transparent bg-transparent px-2 py-1 hover:border-border focus:border-brand focus:bg-surface focus:outline-none"
        />
        {error && <p className="px-2 text-2xs text-status-danger-fg">{error}</p>}
      </td>
      <td className="px-3 py-2 align-middle">
        <select
          defaultValue={row.categoryId}
          onChange={(e) => save("categoryId", e.target.value)}
          aria-label="Category"
          className="rounded-control border border-transparent bg-transparent px-2 py-1 hover:border-border focus:border-brand focus:bg-surface focus:outline-none"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </td>
      <AttrCell value={row.colourId}  opts={options.colours}  onSave={(v) => saveAttr("colourId", v)} />
      <AttrCell value={row.platingId} opts={options.platings} onSave={(v) => saveAttr("platingId", v)} />
      <AttrCell value={row.stoneId}   opts={options.stones}   onSave={(v) => saveAttr("stoneId", v)} />
      <td className="px-3 py-2 align-middle">
        <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
      </td>
      <td className="tnum px-3 py-2 align-middle">{row.onHand}</td>

      {canEditPricing && (
        <>
          {/* Cost is read-only here. It is derived from the approved
              inward, not something to be typed over after the fact. */}
          <td className="tnum px-3 py-2 text-right align-middle text-text-muted">
            {formatPaise(row.landedCostPaise)}
          </td>
          <td className="px-3 py-2 text-right align-middle">
            <PriceCell
              value={row.mrpPaise}
              onSave={(v) => savePrice("mrpPaise", v)}
            />
          </td>
          <td className="px-3 py-2 text-right align-middle">
            <PriceCell
              value={row.sellingPricePaise}
              onSave={(v) => savePrice("sellingPricePaise", v)}
            />
          </td>
        </>
      )}
    </tr>
  );
}

function PriceCell({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (raw: string) => void;
}) {
  const initial = value === null ? "" : (value / 100).toFixed(2);
  return (
    <input
      defaultValue={initial}
      inputMode="decimal"
      placeholder="—"
      onBlur={(e) => {
        if (e.target.value.trim() !== initial) onSave(e.target.value);
      }}
      aria-label="Price in rupees"
      className="tnum w-24 rounded-control border border-transparent bg-transparent px-2 py-1 text-right hover:border-border focus:border-brand focus:bg-surface focus:outline-none"
    />
  );
}

function AttrCell({
  value,
  opts,
  onSave,
}: {
  value: string | null;
  opts: Array<{ id: string; value: string }>;
  onSave: (v: string) => void;
}) {
  return (
    <td className="px-3 py-2 align-middle">
      <select
        defaultValue={value ?? ""}
        onChange={(e) => onSave(e.target.value)}
        className="rounded-control border border-transparent bg-transparent px-2 py-1 text-sm hover:border-border focus:border-brand focus:bg-surface focus:outline-none"
      >
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o.id} value={o.id}>{o.value}</option>
        ))}
      </select>
    </td>
  );
}
