"use client";

import { useState, useTransition } from "react";
import { createProduct } from "./actions";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { parseRupeesToPaise } from "@/lib/money";
import type { Category, ItemFormOptions } from "@/types/domain";

/**
 * Creates a catalog entry before any goods arrive.
 *
 * The item is created as pending_pricing with no stock. It is NOT
 * sellable: it becomes attachable to an inward, and only an approved
 * inward posts stock and activates it. Creating a product is not the
 * same as having one, and the UI says so.
 */
export function NewProductDialog({
  categories,
  options,
  canSetPricing,
}: {
  categories: Category[];
  options: ItemFormOptions;
  canSetPricing: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button variant="primary" onClick={() => setOpen(true)}>
        New product
      </Button>
    );
  }

  const types = options.itemTypes.filter((t) => t.categoryId === categoryId);

  const submit = (fd: FormData) =>
    start(async () => {
      setError(null);
      if (canSetPricing) {
        const mrp = String(fd.get("mrp") ?? "").trim();
        const sell = String(fd.get("selling") ?? "").trim();
        if (mrp) {
          const p = parseRupeesToPaise(mrp);
          if (p === null) return setError("Check the MRP amount.");
          fd.set("mrpPaise", String(p));
        }
        if (sell) {
          const p = parseRupeesToPaise(sell);
          if (p === null) return setError("Check the selling price.");
          fd.set("sellingPricePaise", String(p));
        }
      }
      const result = await createProduct(fd);
      if (result.ok) {
        setSaved(result.data);
        setTimeout(() => setSaved(null), 4000);
        (document.getElementById("new-product-form") as HTMLFormElement)?.reset();
      } else {
        setError(result.error);
      }
    });

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">New product</h2>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardBody>
        <form id="new-product-form" action={submit} className="space-y-3">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required autoFocus />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              rows={2}
              placeholder="Optional detail the name cannot hold"
              className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm placeholder:text-text-subtle focus:border-brand focus:outline-none"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="categoryId">Category</Label>
              <Select
                id="categoryId"
                name="categoryId"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
              >
                <option value="">Choose category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="itemTypeId">Type</Label>
              <Select id="itemTypeId" name="itemTypeId" disabled={types.length === 0}>
                <option value="">{types.length === 0 ? "None for this category" : "—"}</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Attr name="colourId"  label="Colour"  opts={options.colours} />
            <Attr name="platingId" label="Plating" opts={options.platings} />
            <Attr name="stoneId"   label="Style"   opts={options.stones} />
            <Attr name="sizeId"    label="Size"    opts={options.sizes} />
          </div>

          {canSetPricing && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="mrp">MRP (optional)</Label>
                <Input id="mrp" name="mrp" inputMode="decimal" className="tnum text-right" />
              </div>
              <div>
                <Label htmlFor="selling">Selling price (optional)</Label>
                <Input id="selling" name="selling" inputMode="decimal" className="tnum text-right" />
              </div>
            </div>
          )}

          <p className="rounded-control bg-surface-sunken px-3 py-2 text-2xs text-text-muted">
            This creates a catalog entry only. No stock is posted and it cannot be
            sold until it is added to a material inward and that document is approved.
          </p>

          {saved && (
            <p className="text-sm text-status-done-fg">
              Created as {saved}. Add the next one, or attach it to an inward.
            </p>
          )}
          {error && <FieldError>{error}</FieldError>}

          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Creating…" : "Create product"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function Attr({
  name,
  label,
  opts,
}: {
  name: string;
  label: string;
  opts: Array<{ id: string; value: string }>;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Select id={name} name={name}>
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o.id} value={o.id}>{o.value}</option>
        ))}
      </Select>
    </div>
  );
}
