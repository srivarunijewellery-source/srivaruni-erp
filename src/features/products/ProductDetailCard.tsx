"use client";

import { useState, useTransition } from "react";
import { DetailShell, Fact } from "@/components/ui/DetailShell";
import { Tag } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { updateProduct } from "./actions";
import { updateItemAttributes } from "@/features/inward/pricingActions";
import { formatPaise, parseRupeesToPaise } from "@/lib/money";
import type { ProductDetail } from "./queries";
import type { Category, ItemFormOptions } from "@/types/domain";

export function ProductDetailCard({
  product,
  categories,
  options,
  canEditPricing,
}: {
  product: ProductDetail;
  categories: Category[];
  options: ItemFormOptions;
  canEditPricing: boolean;
}) {
  return (
    <DetailShell
      title="Item details"
      view={
        <div className="space-y-4">
          <PriceTiles product={product} showCost={canEditPricing} />
          <div className="space-y-0">
          <Fact label="Name" value={product.name} />
          <Fact
            label="Tag"
            value={<span className="font-mono text-2xs">{product.barcode}</span>}
          />
          <Fact label="Category" value={product.categoryName} />
          <Fact label="Type" value={product.itemTypeName ?? "—"} />
          <Fact
            label="Attributes"
            value={
              <span className="flex flex-wrap justify-end gap-1">
                {[
                  product.colourName,
                  product.platingName,
                  product.stoneName,
                  product.sizeName,
                ].filter(Boolean).length === 0 ? (
                  <span className="text-text-subtle">None set</span>
                ) : (
                  <>
                    {product.colourName && <Tag>{product.colourName}</Tag>}
                    {product.platingName && <Tag>{product.platingName}</Tag>}
                    {product.stoneName && <Tag>{product.stoneName}</Tag>}
                    {product.sizeName && <Tag muted>{product.sizeName}</Tag>}
                  </>
                )}
              </span>
            }
          />
          <Fact label="HSN" value={product.hsn ?? "—"} />
          <Fact
            label="Tax rate"
            value={product.gstRate === null ? "—" : `${product.gstRate}%`}
          />
          <Fact
            label="Description"
            value={
              product.description ? (
                <span className="whitespace-pre-wrap">{product.description}</span>
              ) : (
                <span className="text-text-subtle">—</span>
              )
            }
          />
          </div>
        </div>
      }
      edit={(done) => (
        <EditForm
          product={product}
          categories={categories}
          options={options}
          canEditPricing={canEditPricing}
          onDone={done}
        />
      )}
    />
  );
}

function EditForm({
  product,
  categories,
  options,
  canEditPricing,
  onDone,
}: {
  product: ProductDetail;
  categories: Category[];
  options: ItemFormOptions;
  canEditPricing: boolean;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (fd: FormData) =>
    start(async () => {
      setError(null);

      // Attributes and core fields live in different tables with
      // different guards, so they save through their own actions.
      const attrs = new FormData();
      attrs.set("itemId", product.id);
      attrs.set("inwardId", "00000000-0000-0000-0000-000000000000");
      for (const k of ["colourId", "platingId", "stoneId", "sizeId"]) {
        attrs.set(k, String(fd.get(k) ?? ""));
      }
      const attrResult = await updateItemAttributes(attrs);
      if (!attrResult.ok) {
        setError(attrResult.error);
        return;
      }

      const core = new FormData();
      core.set("itemId", product.id);
      core.set("name", String(fd.get("name") ?? ""));
      core.set("description", String(fd.get("description") ?? ""));
      core.set("categoryId", String(fd.get("categoryId") ?? ""));

      if (canEditPricing) {
        const mrp = parseRupeesToPaise(String(fd.get("mrp") ?? ""));
        const sell = parseRupeesToPaise(String(fd.get("selling") ?? ""));
        if (mrp === null || sell === null) {
          setError("Enter prices like 1299 or 1299.50");
          return;
        }
        core.set("mrpPaise", String(mrp));
        core.set("sellingPricePaise", String(sell));
      }

      const result = await updateProduct(core);
      if (result.ok) onDone();
      else setError(result.error);
    });

  const types = options.itemTypes.filter((t) => t.categoryId === product.categoryId);

  return (
    <form action={submit} className="space-y-3">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={product.name} required />
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={product.description ?? ""}
          placeholder="Stone count, weight, chain length, vendor design reference…"
          className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm placeholder:text-text-subtle focus:border-brand focus:outline-none"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="categoryId">Category</Label>
          <Select id="categoryId" name="categoryId" defaultValue={product.categoryId}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="itemTypeId">Type</Label>
          <Select id="itemTypeId" name="itemTypeId" defaultValue={product.itemTypeId ?? ""}>
            <option value="">—</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Attr name="colourId"  label="Colour"  value={product.colourId}  opts={options.colours} />
        <Attr name="platingId" label="Plating" value={product.platingId} opts={options.platings} />
        <Attr name="stoneId"   label="Style"   value={product.stoneId}   opts={options.stones} />
        <Attr name="sizeId"    label="Size"    value={product.sizeId}    opts={options.sizes} />
      </div>

      {canEditPricing && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="mrp">MRP</Label>
            <Input
              id="mrp"
              name="mrp"
              inputMode="decimal"
              className="tnum text-right"
              defaultValue={product.mrpPaise === null ? "" : (product.mrpPaise / 100).toFixed(2)}
            />
          </div>
          <div>
            <Label htmlFor="selling">Selling price</Label>
            <Input
              id="selling"
              name="selling"
              inputMode="decimal"
              className="tnum text-right"
              defaultValue={
                product.sellingPricePaise === null
                  ? ""
                  : (product.sellingPricePaise / 100).toFixed(2)
              }
            />
          </div>
        </div>
      )}

      {error && <FieldError>{error}</FieldError>}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Attr({
  name,
  label,
  value,
  opts,
}: {
  name: string;
  label: string;
  value: string | null;
  opts: Array<{ id: string; value: string }>;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Select id={name} name={name} defaultValue={value ?? ""}>
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o.id} value={o.id}>{o.value}</option>
        ))}
      </Select>
    </div>
  );
}

/**
 * Pricing as tiles rather than another label/value row.
 *
 * Cost, MRP, selling and margin are compared against each other, not
 * read in sequence, so they belong side by side. Margin is derived, not
 * stored, and turns red when selling sits below landed cost.
 */
function PriceTiles({
  product,
  showCost,
}: {
  product: ProductDetail;
  showCost: boolean;
}) {
  const sell = product.sellingPricePaise ?? 0;
  const cost = product.landedCostPaise ?? 0;
  const margin = sell > 0 && cost > 0 ? ((sell - cost) / sell) * 100 : null;

  return (
    <div className={`grid gap-2 ${showCost ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}>
      {showCost && (
        <Tile label="Purchase cost" value={formatPaise(product.landedCostPaise)} muted />
      )}
      <Tile label="MRP" value={formatPaise(product.mrpPaise)} muted />
      <Tile label="Selling" value={formatPaise(product.sellingPricePaise)} />
      {showCost && (
        <Tile
          label="Margin"
          value={margin === null ? "—" : `${margin.toFixed(1)}%`}
          danger={margin !== null && margin < 0}
        />
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  muted,
  danger,
}: {
  label: string;
  value: string;
  muted?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-card border border-border bg-surface-sunken px-3 py-2">
      <p className="text-2xs uppercase tracking-wide text-text-subtle">{label}</p>
      <p
        className={`tnum mt-0.5 text-base font-semibold ${
          danger ? "text-status-danger-fg" : muted ? "text-text-muted" : "text-text"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
