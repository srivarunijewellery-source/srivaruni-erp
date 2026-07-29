"use client";

import { useState, useTransition } from "react";
import {
  savePricingLine,
  saveAdditionalCost,
  updateItemAttributes,
} from "./pricingActions";
import { updateInwardLineQty } from "./actions";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { Barcode } from "@/components/ui/Barcode";
import { Tag } from "@/components/ui/Tag";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { NarrowInput, Label, Select } from "@/components/ui/Field";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise, parseRupeesToPaise, suggestMrpPaise } from "@/lib/money";
import type { PricingLine, AdditionalCost, InwardTaxSummary } from "./pricing";
import type { ItemFormOptions } from "@/types/domain";

/**
 * Pricing as a dense table, one row per line.
 *
 * Was a card per line, which is fine for five items and unusable for a
 * hundred: pricing a full consignment meant scrolling past several
 * screens of form. Everything for a line now fits one row, saves on
 * blur, and attributes collapse to tags with editing behind a click,
 * because they are read far more often than they are changed.
 */
export function PricingPanel({
  inwardId,
  lines,
  additionalCosts,
  options,
  tax,
}: {
  inwardId: string;
  lines: PricingLine[];
  additionalCosts: AdditionalCost[];
  options: ItemFormOptions;
  tax: InwardTaxSummary | null;
}) {
  const [editingAttrs, setEditingAttrs] = useState<PricingLine | null>(null);
  const [error, setError] = useState<string | null>(null);

  const priced = lines.filter((l) => l.ratePaise !== null).length;
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface px-3 py-2">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            <span className="tnum font-medium">{priced}</span>
            <span className="text-text-muted"> of {lines.length} priced</span>
          </span>
          <span className="text-text-muted">
            <span className="tnum">{totalQty}</span> pieces
          </span>
          {tax && (
            <>
              <Tag muted>{tax.isInterstate ? "IGST" : "CGST + SGST"}</Tag>
              <Tag muted>
                {tax.itcEligible ? "Credit recoverable" : "Tax in cost"}
              </Tag>
            </>
          )}
        </div>
        <AdditionalCosts inwardId={inwardId} existing={additionalCosts} />
      </div>

      {error && (
        <p className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-sunken">
              <Th className="w-[36px]">#</Th>
              <Th className="w-[48px]" />
              <Th className="min-w-[200px]">Item</Th>
              <Th right className="w-[72px]">Qty</Th>
              <Th right className="w-[104px]">Rate</Th>
              <Th right className="w-[104px]">MRP</Th>
              <Th right className="w-[104px]">Selling</Th>
              <Th right className="w-[92px]">Tax</Th>
              <Th right className="w-[100px]">Landed</Th>
              <Th right className="w-[72px]">Margin</Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <Row
                key={line.lineId}
                index={i + 1}
                line={line}
                inwardId={inwardId}
                onAttrs={() => setEditingAttrs(line)}
                onError={setError}
              />
            ))}
          </tbody>
        </table>
      </div>

      {editingAttrs && (
        <AttributeModal
          line={editingAttrs}
          inwardId={inwardId}
          options={options}
          onClose={() => setEditingAttrs(null)}
        />
      )}
    </div>
  );
}

function Row({
  index,
  line,
  inwardId,
  onAttrs,
  onError,
}: {
  index: number;
  line: PricingLine;
  inwardId: string;
  onAttrs: () => void;
  onError: (m: string | null) => void;
}) {
  const rupees = (p: number | null) => (p === null ? "" : (p / 100).toFixed(2));

  const [qty, setQty] = useState(String(line.qty));
  const [rate, setRate] = useState(rupees(line.ratePaise));
  const [mrp, setMrp] = useState(rupees(line.mrpPaise));
  const [selling, setSelling] = useState(rupees(line.sellingPricePaise));
  const [pending, start] = useTransition();

  const tags = [line.colourName, line.platingName, line.stoneName, line.sizeName]
    .filter(Boolean) as string[];

  /** Saves on blur. A Save button per row is one click too many across
   *  a hundred lines, and the values are independent so a partial save
   *  is never inconsistent. */
  const commit = () => {
    const ratePaise = parseRupeesToPaise(rate);
    if (rate.trim() !== "" && ratePaise === null) {
      onError("Enter a rate like 450 or 450.50");
      return;
    }
    if (ratePaise === null) return;

    const mrpPaise = mrp.trim() === "" ? null : parseRupeesToPaise(mrp);
    const sellPaise = selling.trim() === "" ? null : parseRupeesToPaise(selling);

    start(async () => {
      onError(null);
      const fd = new FormData();
      fd.set("lineId", line.lineId);
      fd.set("itemId", line.itemId);
      fd.set("inwardId", inwardId);
      fd.set("ratePaise", String(ratePaise));
      fd.set("gstRate", String(line.gstRate));
      if (mrpPaise !== null) fd.set("mrpPaise", String(mrpPaise));
      if (sellPaise !== null) fd.set("sellingPricePaise", String(sellPaise));
      const r = await savePricingLine(fd);
      if (!r.ok) onError(r.error);
    });
  };

  const commitQty = () => {
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1) {
      setQty(String(line.qty));
      return;
    }
    if (n === line.qty) return;
    start(async () => {
      onError(null);
      const fd = new FormData();
      fd.set("lineId", line.lineId);
      fd.set("inwardId", inwardId);
      fd.set("qty", String(n));
      const r = await updateInwardLineQty(fd);
      if (!r.ok) {
        onError(r.error);
        setQty(String(line.qty));
      }
    });
  };

  /** Fills MRP and selling from the category multiplier once a rate is
   *  in. Only fires on blur of the rate when both are still empty, so it
   *  never overwrites a price that was typed deliberately. */
  const maybeSuggest = () => {
    const ratePaise = parseRupeesToPaise(rate);
    if (ratePaise === null || ratePaise === 0) return;
    if (mrp.trim() !== "" || selling.trim() !== "") return;
    const s = suggestMrpPaise(ratePaise, line.markupMultiplier);
    setMrp((s / 100).toFixed(2));
    setSelling((s / 100).toFixed(2));
  };

  const lineTax = line.cgstPaise + line.sgstPaise + line.igstPaise;
  const sell = line.sellingPricePaise ?? 0;
  const margin =
    sell > 0 && line.landedUnitCostPaise > 0
      ? ((sell - line.landedUnitCostPaise) / sell) * 100
      : null;

  return (
    <tr className={`border-b border-border last:border-0 ${pending ? "opacity-60" : ""}`}>
      <td className="px-2 py-1.5 text-2xs text-text-subtle">{index}</td>
      <td className="px-2 py-1.5">
        <PhotoThumb src={itemPhotoUrl(line.photoPath)} alt={line.name} size={40} />
      </td>
      <td className="px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{line.name}</span>
          <Barcode code={line.barcode} />
        </div>
        <button
          onClick={onAttrs}
          className="mt-0.5 flex flex-wrap items-center gap-1 text-left"
          title="Edit attributes"
        >
          <span className="text-2xs text-text-subtle">{line.categoryName}</span>
          {tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
          <span className="text-2xs text-brand underline">
            {tags.length === 0 ? "add attributes" : "edit"}
          </span>
        </button>
      </td>

      <td className="px-2 py-1.5 text-right">
        <NarrowInput
          widthClass="w-[60px]"
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onBlur={commitQty}
          className="tnum text-right"
          aria-label="Quantity"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <NarrowInput
          widthClass="w-[92px]"
          inputMode="decimal"
          placeholder="0.00"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          onBlur={() => {
            maybeSuggest();
            commit();
          }}
          className="tnum text-right"
          aria-label="Purchase rate"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <NarrowInput
          widthClass="w-[92px]"
          inputMode="decimal"
          placeholder="0.00"
          value={mrp}
          onChange={(e) => setMrp(e.target.value)}
          onBlur={commit}
          className="tnum text-right"
          aria-label="MRP"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <NarrowInput
          widthClass="w-[92px]"
          inputMode="decimal"
          placeholder="0.00"
          value={selling}
          onChange={(e) => setSelling(e.target.value)}
          onBlur={commit}
          className="tnum text-right"
          aria-label="Selling price"
        />
      </td>

      <td className="tnum px-2 py-1.5 text-right text-2xs text-text-muted">
        {lineTax > 0 ? formatPaise(lineTax) : "—"}
      </td>
      <td className="tnum px-2 py-1.5 text-right">
        {line.landedUnitCostPaise > 0 ? formatPaise(line.landedUnitCostPaise) : "—"}
      </td>
      <td className="tnum px-2 py-1.5 text-right text-2xs">
        {margin === null ? (
          "—"
        ) : (
          <span className={margin < 0 ? "text-status-danger-fg" : "text-status-done-fg"}>
            {margin.toFixed(1)}%
          </span>
        )}
      </td>
    </tr>
  );
}

function AttributeModal({
  line,
  inwardId,
  options,
  onClose,
}: {
  line: PricingLine;
  inwardId: string;
  options: ItemFormOptions;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();

  const save = (fd: FormData) =>
    start(async () => {
      fd.set("itemId", line.itemId);
      fd.set("inwardId", inwardId);
      await updateItemAttributes(fd);
      onClose();
    });

  const fields = [
    { name: "colourId", label: "Colour", value: line.colourId, opts: options.colours },
    { name: "platingId", label: "Plating", value: line.platingId, opts: options.platings },
    { name: "stoneId", label: "Stone", value: line.stoneId, opts: options.stones },
    { name: "sizeId", label: "Size", value: line.sizeId, opts: options.sizes },
  ];

  return (
    <Modal title={line.name} onClose={onClose} width="max-w-lg">
      <form action={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {fields.map((f) => (
            <div key={f.name}>
              <Label htmlFor={f.name}>{f.label}</Label>
              <Select id={f.name} name={f.name} defaultValue={f.value ?? ""}>
                <option value="">—</option>
                {f.opts.map((o) => (
                  <option key={o.id} value={o.id}>{o.value}</option>
                ))}
              </Select>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : "Save attributes"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
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
    { type: "hamali", label: "Hamali", basis: "quantity" },
  ];

  return (
    <div className={`flex items-center gap-2 ${pending ? "opacity-60" : ""}`}>
      {rows.map((r) => {
        const cur = find(r.type);
        return (
          <label key={r.type} className="flex items-center gap-1">
            <span className="text-2xs uppercase tracking-wide text-text-subtle">
              {r.label}
            </span>
            <NarrowInput
              widthClass="w-[84px]"
              inputMode="decimal"
              placeholder="0.00"
              defaultValue={cur ? (cur.amountPaise / 100).toFixed(2) : ""}
              onBlur={(e) => save(r.type, e.target.value, r.basis)}
              className="tnum py-1 text-right"
            />
          </label>
        );
      })}
    </div>
  );
}

function Th({
  children,
  right,
  className,
}: {
  children?: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <th
      className={`px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text-muted ${
        right ? "text-right" : "text-left"
      } ${className ?? ""}`}
    >
      {children}
    </th>
  );
}
