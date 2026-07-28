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
          {canEditPricing && (
            <Fact label="Purchase cost" value={formatPaise(product.landedCostPaise)} />
          )}
          <Fact label="MRP" value={formatPaise(product.mrpPaise)} />
          <Fact label="Selling price" value={formatPaise(product.sellingPricePaise)} />
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
        <Attr name="stoneId"   label="Stone"   value={product.stoneId}   opts={options.stones} />
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
