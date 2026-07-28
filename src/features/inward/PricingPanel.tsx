"use client";

import { useState, useTransition } from "react";
import { savePricingLine, saveAdditionalCost, updateItemAttributes } from "./pricingActions";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { Barcode } from "@/components/ui/Barcode";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise, parseRupeesToPaise, suggestMrpPaise } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { PricingLine, AdditionalCost } from "./pricing";
import type { AttributeOption, ItemFormOptions } from "@/types/domain";

const ATTRS = [
  { key: "colour",  field: "colourId",  label: "Colour" },
  { key: "plating", field: "platingId", label: "Plating" },
  { key: "stone",   field: "stoneId",   label: "Stone" },
  { key: "size",    field: "sizeId",    label: "Size" },
] as const;

/**
 * The pricing gate.
 *
 * Image-led on purpose: the owner is 8,000 miles from the stock and
 * prices from the photograph, which is also the moment attribute
 * guesses made at the counter get corrected. Rate, MRP and selling
 * price all live on the same row as the picture.
 */
export function PricingPanel({
  inwardId,
  lines,
  additionalCosts,
  options,
}: {
  inwardId: string;
  lines: PricingLine[];
  additionalCosts: AdditionalCost[];
  options: ItemFormOptions;
}) {
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const priced = lines.filter((l) => l.ratePaise !== null && l.mrpPaise !== null).length;


  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">Pricing</h2>
            <p className="text-sm text-text-muted">
              <span className="tnum font-medium">{priced}</span> of{" "}
              <span className="tnum">{lines.length}</span> lines priced ·{" "}
              <span className="tnum">{totalQty}</span> pieces
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <AdditionalCosts inwardId={inwardId} existing={additionalCosts} />
        </CardBody>
      </Card>

      <div className="space-y-3">
        {lines.map((line) => (
          <PricingRow
            key={line.lineId}
            inwardId={inwardId}
            line={line}
            options={{
              colour:  options.colours,
              plating: options.platings,
              stone:   options.stones,
              size:    options.sizes,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function PricingRow({
  inwardId,
  line,
  options,
}: {
  inwardId: string;
  line: PricingLine;
  options: Record<string, AttributeOption[]>;
}) {
  const [rate, setRate] = useState(
    line.ratePaise === null ? "" : (line.ratePaise / 100).toFixed(2),
  );
  const [mrp, setMrp] = useState(
    line.mrpPaise === null ? "" : (line.mrpPaise / 100).toFixed(2),
  );
  const [selling, setSelling] = useState(
    line.sellingPricePaise === null ? "" : (line.sellingPricePaise / 100).toFixed(2),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  /** Suggests MRP from the category multiplier. A suggestion, never an
   *  autofill: a wrong prefilled price is worse than a blank field. */
  const suggest = () => {
    const ratePaise = parseRupeesToPaise(rate);
    if (ratePaise === null || ratePaise === 0) {
      setError("Enter the purchase rate first.");
      return;
    }
    const suggested = suggestMrpPaise(ratePaise, line.markupMultiplier);
    setMrp((suggested / 100).toFixed(2));
    setSelling((suggested / 100).toFixed(2));
    setError(null);
  };

  const save = () => {
    const ratePaise = parseRupeesToPaise(rate);
    if (ratePaise === null) {
      setError("Enter a rate like 450 or 450.50");
      return;
    }
    const mrpPaise = mrp.trim() === "" ? null : parseRupeesToPaise(mrp);
    const sellPaise = selling.trim() === "" ? null : parseRupeesToPaise(selling);
    if (mrp.trim() !== "" && mrpPaise === null) {
      setError("Check the MRP amount.");
      return;
    }
    if (selling.trim() !== "" && sellPaise === null) {
      setError("Check the selling price.");
      return;
    }

    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("lineId", line.lineId);
      fd.set("itemId", line.itemId);
      fd.set("inwardId", inwardId);
      fd.set("ratePaise", String(ratePaise));
      fd.set("gstRate", String(line.gstRate));
      if (mrpPaise !== null) fd.set("mrpPaise", String(mrpPaise));
      if (sellPaise !== null) fd.set("sellingPricePaise", String(sellPaise));

      const result = await savePricingLine(fd);
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(result.error);
      }
    });
  };

  const saveAttr = (field: string, value: string) =>
    start(async () => {
      const fd = new FormData();
      fd.set("itemId", line.itemId);
      fd.set("inwardId", inwardId);
      fd.set("colourId",  field === "colourId"  ? value : (line.colourId ?? ""));
      fd.set("platingId", field === "platingId" ? value : (line.platingId ?? ""));
      fd.set("stoneId",   field === "stoneId"   ? value : (line.stoneId ?? ""));
      fd.set("sizeId",    field === "sizeId"    ? value : (line.sizeId ?? ""));
      const result = await updateItemAttributes(fd);
      if (!result.ok) setError(result.error);
    });

  const current: Record<string, string | null> = {
    colourId: line.colourId,
    platingId: line.platingId,
    stoneId: line.stoneId,
    sizeId: line.sizeId,
  };

  return (
    <Card className={cn(pending && "opacity-70")}>
      <CardBody>
        <div className="flex flex-col gap-4 sm:flex-row">
          {/* Large enough to price from, and hover magnifies further. */}
          <PhotoThumb src={itemPhotoUrl(line.photoPath)} alt={line.name} size={104} />

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium">{line.name}</span>
              <Barcode code={line.barcode} />
              <span className="text-sm text-text-muted">
                {line.categoryName} · <span className="tnum">{line.qty}</span>{" "}
                {line.qty === 1 ? "piece" : "pieces"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ATTRS.map((a) => (
                <label key={a.key} className="block">
                  <span className="mb-0.5 block text-2xs uppercase tracking-wide text-text-subtle">
                    {a.label}
                  </span>
                  <select
                    defaultValue={current[a.field] ?? ""}
                    onChange={(e) => saveAttr(a.field, e.target.value)}
                    className="w-full rounded-control border border-border bg-surface px-2 py-1 text-sm focus:border-brand focus:outline-none"
                  >
                    <option value="">—</option>
                    {(options[a.key] ?? []).map((o) => (
                      <option key={o.id} value={o.id}>{o.value}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-end">
              <Money label="Purchase rate" value={rate} onChange={setRate} />
              <Money label="MRP" value={mrp} onChange={setMrp} />
              <Money label="Selling price" value={selling} onChange={setSelling} />
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={suggest} type="button">
                  Suggest
                </Button>
                <Button size="sm" variant="primary" onClick={save} disabled={pending}>
                  {saved ? "Saved" : "Save"}
                </Button>
              </div>
            </div>

            {line.ratePaise !== null && (
              <p className="text-2xs text-text-subtle">
                Rate on file: {formatPaise(line.ratePaise)} per piece · line total{" "}
                {formatPaise(line.ratePaise * line.qty)}. Freight is prorated at approval.
              </p>
            )}
            {error && <p className="text-sm text-status-danger-fg">{error}</p>}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function Money({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-2xs uppercase tracking-wide text-text-subtle">
        {label}
      </span>
      <input
        value={value}
        inputMode="decimal"
        placeholder="0.00"
        onChange={(e) => onChange(e.target.value)}
        className="tnum w-full rounded-control border border-border bg-surface px-2 py-1 text-right text-sm focus:border-brand focus:outline-none"
      />
    </label>
  );
}

function AdditionalCosts({
  inwardId,
  existing,
}: {
  inwardId: string;
  existing: AdditionalCost[];
}) {
  const [pending, start] = useTransition();
  const find = (t: string) => existing.find((c) => c.costType === t);

  const save = (costType: string, raw: string, basis: string) => {
    const paise = parseRupeesToPaise(raw || "0");
    if (paise === null) return;
    start(async () => {
      const fd = new FormData();
      fd.set("inwardId", inwardId);
      fd.set("costType", costType);
      fd.set("amountPaise", String(paise));
      fd.set("basis", basis);
      await saveAdditionalCost(fd);
    });
  };

  const rows = [
    { type: "freight", label: "Freight", basis: "value" },
    { type: "packing", label: "Packing", basis: "quantity" },
    { type: "hamali",  label: "Hamali",  basis: "quantity" },
  ];

  return (
    <div className={cn("space-y-2", pending && "opacity-70")}>
      <p className="text-sm text-text-muted">
        Costs on the whole consignment. Prorated across lines at approval, exact to the paisa.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {rows.map((r) => {
          const cur = find(r.type);
          return (
            <label key={r.type} className="block">
              <span className="mb-0.5 block text-2xs uppercase tracking-wide text-text-subtle">
                {r.label}
              </span>
              <input
                defaultValue={cur ? (cur.amountPaise / 100).toFixed(2) : ""}
                inputMode="decimal"
                placeholder="0.00"
                onBlur={(e) => save(r.type, e.target.value, r.basis)}
                className="tnum w-full rounded-control border border-border bg-surface px-2 py-1 text-right text-sm focus:border-brand focus:outline-none"
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
