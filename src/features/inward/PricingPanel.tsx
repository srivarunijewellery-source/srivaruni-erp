"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ROUTES } from "@/config/nav";
import { DocumentPricingBar } from "./DocumentPricingBar";
import { PriceSheetUpload } from "./PriceSheetUpload";
import { saveInwardDiscount } from "./bulkPricingActions";
import type { PriceBand } from "@/types/domain";
import {
  addItemPhotos,
  listItemPhotos,
  removeItemPhoto,
  renameInwardItem,
  savePricingLine,
  saveAdditionalCost,
  updateItemAttributes,
  updateItemCategory,
} from "./pricingActions";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { downscale } from "@/lib/photos";
import { STORAGE_BUCKETS } from "@/config/app";
import { updateInwardLineQty } from "./actions";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { Barcode } from "@/components/ui/Barcode";
import { Tag } from "@/components/ui/Tag";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { NarrowInput, Input, Label, Select, FieldError } from "@/components/ui/Field";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise, parseRupeesToPaise } from "@/lib/money";
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
  bands,
  vendorPricing,
  discount,
  isApproved,
}: {
  inwardId: string;
  lines: PricingLine[];
  additionalCosts: AdditionalCost[];
  options: ItemFormOptions;
  tax: InwardTaxSummary | null;
  bands: PriceBand[];
  vendorPricing: {
    name: string;
    pricingMode: "code_multiple" | "serial_list" | "manual";
    codeMultiple: number | null;
  } | null;
  discount: { kind: "none" | "percent" | "amount"; bps: number | null; paise: number | null };
  /** Already approved: stock is posted and costs are live on the products. */
  isApproved: boolean;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Which lines a band applies to. Empty means the whole document.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const [editingAttrs, setEditingAttrs] = useState<PricingLine | null>(null);
  const [error, setError] = useState<string | null>(null);

  const priced = lines.filter((l) => l.ratePaise !== null).length;
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);

  // Re-pricing an approved document restates the cost of stock that is
  // already on the shelf and already sellable. That deserves one
  // deliberate step, not a stray click on a rate field.
  if (isApproved && !unlocked) {
    return (
      <div className="rounded-card border border-status-pending-fg/40 bg-status-pending-bg p-4">
        <h3 className="font-medium">This inward is already approved</h3>
        <ul className="mt-2 space-y-1 text-sm text-text-muted">
          <li>Stock is posted and these pieces are on sale.</li>
          <li>
            Changing a rate, a charge or the bill discount restates the cost of every
            piece on this document, and the margins reported against them.
          </li>
          <li>Prices already printed on tags will not match until they are reprinted.</li>
        </ul>
        <div className="mt-3 flex items-center gap-3">
          <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
            Edit pricing anyway
          </Button>
          <span className="text-2xs text-text-subtle">
            Every change is recorded against your name.
          </span>
        </div>

        {confirming && (
          <Modal title="Re-price an approved document?" onClose={() => setConfirming(false)}>
            <p className="text-sm text-text-muted">
              Cost and margin will be recalculated for every line on this document. Prices
              already set stay as they are unless you change them.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
                Leave it alone
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setUnlocked(true);
                }}
              >
                Yes, let me edit
              </Button>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isApproved && (
        <p className="rounded-control border border-status-pending-fg/40 bg-status-pending-bg px-3 py-2 text-sm">
          Editing an approved document. Costs on the products update as you go.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface px-3 py-2">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            <span className="tnum font-medium">{priced}</span>
            <span className="text-text-muted"> of {lines.length} priced</span>
          </span>
          <span className="text-text-muted">
            <span className="tnum">{totalQty}</span> pieces
          </span>

        </div>
        <AdditionalCosts
          inwardId={inwardId}
          existing={additionalCosts}
          discount={discount}
        />
      </div>

      {tax && <TaxBanner tax={tax} />}

      {error && (
        <p className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
          {error}
        </p>
      )}

      {/* Sits above the band bar: when a vendor has sent a sheet it is
          the fastest route to a priced document, and the rules below are
          the fallback for what it could not match. */}
      <PriceSheetUpload inwardId={inwardId} vendorPriceMode={tax?.priceMode ?? null} />

      <DocumentPricingBar
        inwardId={inwardId}
        bands={bands}
        vendor={vendorPricing}
        selectedLineIds={[...picked]}
        selectedLabel={
          picked.size === 1
            ? lines.find((l) => picked.has(l.lineId))?.name
            : undefined
        }
      />

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-sunken">
              <Th className="w-[34px]">
                {/* Select-all, so "price these twenty studs" is two taps
                    rather than twenty. */}
                <input
                  type="checkbox"
                  aria-label="Select every line"
                  className="size-4 accent-[var(--color-brand)]"
                  checked={picked.size > 0 && picked.size === lines.length}
                  ref={(el) => {
                    if (el) el.indeterminate =
                      picked.size > 0 && picked.size < lines.length;
                  }}
                  onChange={(e) =>
                    setPicked(
                      e.target.checked
                        ? new Set(lines.map((l) => l.lineId))
                        : new Set(),
                    )
                  }
                />
              </Th>
              <Th className="w-[36px]">#</Th>
              <Th className="w-[48px]" />
              <Th className="min-w-[200px]">Item</Th>
              <Th right className="w-[72px]">Qty</Th>
              <Th right className="w-[104px]">Rate</Th>
              <Th right className="w-[104px]">MRP</Th>
              <Th right className="w-[104px]">Selling</Th>
              <Th right className="w-[92px]">Tax</Th>
              <Th right className="w-[104px]">Incl. tax</Th>
              <Th right className="w-[100px]">Landed</Th>
              <Th right className="w-[72px]">Margin</Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <Row
                key={`${line.lineId}:${line.ratePaise ?? ""}:${line.mrpPaise ?? ""}:${line.sellingPricePaise ?? ""}`}
                index={i + 1}
                line={line}
                picked={picked.has(line.lineId)}
                onPick={() => toggle(line.lineId)}
                inwardId={inwardId}
                categories={options.categories}
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
  picked,
  onPick,
  inwardId,
  categories,
  onAttrs,
  onError,
}: {
  index: number;
  line: PricingLine;
  picked: boolean;
  onPick: () => void;
  inwardId: string;
  categories: Array<{ id: string; name: string }>;
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
    // Clear first. Previously the banner only cleared inside the success
    // path, so a transient mid-edit error stayed on screen after the
    // values had been corrected.
    onError(null);
    const ratePaise = parseRupeesToPaise(rate);
    if (rate.trim() !== "" && ratePaise === null) {
      onError("Enter a rate like 450 or 450.50");
      return;
    }
    if (ratePaise === null) return;

    let mrpPaise = mrp.trim() === "" ? null : parseRupeesToPaise(mrp);
    let sellPaise = selling.trim() === "" ? null : parseRupeesToPaise(selling);

    // They match in almost every case, so a blank one takes the other.
    if (mrpPaise === null && sellPaise !== null) mrpPaise = sellPaise;
    if (sellPaise === null && mrpPaise !== null) sellPaise = mrpPaise;

    // MRP is a ceiling. The database rejects this too; catching it here
    // just gives a better message than a constraint violation.
    if (mrpPaise !== null && sellPaise !== null && mrpPaise < sellPaise) {
      onError("MRP cannot be lower than the selling price.");
      return;
    }

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


  const lineTax = line.cgstPaise + line.sgstPaise + line.igstPaise;

  const mrpPaiseNow = parseRupeesToPaise(mrp);
  const sellPaiseNow = parseRupeesToPaise(selling);
  const belowSelling =
    mrpPaiseNow !== null && sellPaiseNow !== null && mrpPaiseNow < sellPaiseNow;

  const syncMrpToSelling = () => {
    if (selling.trim() === "") return;
    setMrp(selling);
    // Commit immediately: the click already expressed the intent, and
    // waiting for a blur that may never come would lose it.
    const ratePaise = parseRupeesToPaise(rate);
    if (ratePaise === null) return;
    const sp = parseRupeesToPaise(selling);
    if (sp === null) return;
    start(async () => {
      const fd = new FormData();
      fd.set("lineId", line.lineId);
      fd.set("itemId", line.itemId);
      fd.set("inwardId", inwardId);
      fd.set("ratePaise", String(ratePaise));
      fd.set("gstRate", String(line.gstRate));
      fd.set("mrpPaise", String(sp));
      fd.set("sellingPricePaise", String(sp));
      const r = await savePricingLine(fd);
      if (!r.ok) onError(r.error);
    });
  };
  const sell = line.sellingPricePaise ?? 0;
  const margin =
    sell > 0 && line.landedUnitCostPaise > 0
      ? ((sell - line.landedUnitCostPaise) / sell) * 100
      : null;

  return (
    <tr className={`border-b border-border last:border-0 ${pending ? "opacity-60" : ""}`}>
      <td className="px-2 py-1.5">
        <input
          type="checkbox"
          aria-label={`Select ${line.name}`}
          className="size-4 accent-[var(--color-brand)]"
          checked={picked}
          onChange={onPick}
        />
      </td>
      <td className="px-2 py-1.5 text-2xs text-text-subtle">{index}</td>
      <td className="px-2 py-1.5">
        <PhotoThumb src={itemPhotoUrl(line.photoPath)} alt={line.name} size={40} />
      </td>
      <td className="px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Straight through to the product. Pricing raises questions
              about the piece itself — past prices, photos, attributes —
              and hunting for it by barcode is friction at exactly the
              wrong moment. */}
          <Link
            href={ROUTES.productDetail(line.itemId)}
            className="font-medium rounded-sm underline decoration-border decoration-dotted underline-offset-2 hover:decoration-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          >
            {line.name}
          </Link>
          <Barcode code={line.barcode} />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          {/* Category drives the MRP multiplier, so it is corrected here
              rather than on a separate screen. */}
          <select
            value={line.categoryId}
            onChange={(e) => {
              const fd = new FormData();
              fd.set("itemId", line.itemId);
              fd.set("inwardId", inwardId);
              fd.set("categoryId", e.target.value);
              start(async () => {
                onError(null);
                const r = await updateItemCategory(fd);
                if (!r.ok) onError(r.error);
              });
            }}
            aria-label="Category"
            className="rounded border border-transparent bg-transparent py-0 text-2xs text-text-subtle hover:border-border focus:border-brand focus:outline-none"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
          <button
            onClick={onAttrs}
            className="text-2xs text-brand underline"
            title="Edit attributes"
          >
            {tags.length === 0 ? "add attributes" : "edit"}
          </button>
        </div>
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
          onBlur={commit}
          className="tnum text-right"
          aria-label="Purchase rate"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className="flex items-center justify-end gap-1">
          <NarrowInput
            widthClass="w-[92px]"
            inputMode="decimal"
            placeholder="0.00"
            value={mrp}
            onChange={(e) => setMrp(e.target.value)}
            onBlur={commit}
            className={`tnum text-right ${belowSelling ? "border-status-danger-fg" : ""}`}
            aria-label="MRP"
          />
          {/* MRP and selling are the same in almost every case, so make
              matching them one click rather than retyping the number. */}
          <button
            type="button"
            onClick={syncMrpToSelling}
            title="Set MRP equal to selling price"
            aria-label="Set MRP equal to selling price"
            className="rounded border border-border px-1 text-2xs leading-5 text-text-muted hover:border-brand hover:text-brand"
          >
            =
          </button>
        </div>
        {belowSelling && (
          <span className="block text-2xs text-status-danger-fg">below selling</span>
        )}
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
        {line.taxablePaise > 0 ? formatPaise(line.taxablePaise + lineTax) : "—"}
      </td>
      <td className="tnum px-2 py-1.5 text-right">
        {line.landedUnitCostPaise > 0 ? (
          <>
            {formatPaise(line.landedUnitCostPaise)}
            {line.landedWithTaxPaise !== line.landedUnitCostPaise && (
              <span
                className="block text-2xs text-text-subtle"
                title="Landed cost including purchase tax"
              >
                {formatPaise(line.landedWithTaxPaise)} inc tax
              </span>
            )}
          </>
        ) : (
          "—"
        )}
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
  const [name, setName] = useState(line.name);
  const [shots, setShots] = useState<
    Array<{ id: string; storagePath: string; isPrimary: boolean }>
  >([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The row only carries the primary photo's path, not the ids needed to
  // remove one, so the full set is read when the editor opens.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await listItemPhotos(line.itemId);
      if (!cancelled && r.ok) setShots(r.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [line.itemId]);

  const save = (fd: FormData) =>
    start(async () => {
      setError(null);
      fd.set("itemId", line.itemId);
      fd.set("inwardId", inwardId);

      // Name first: if it is rejected the attributes are untouched,
      // which is easier to reason about than a half-applied save.
      if (name.trim() !== line.name) {
        const rn = await renameInwardItem(fd);
        if (!rn.ok) {
          setError(rn.error);
          return;
        }
      }

      const r = await updateItemAttributes(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
    });

  /**
   * Photos go straight from the browser to the bucket; the server only
   * records where they landed. Same downscale as the capture dialog, so
   * the catalogue does not end up half thumbnails and half 5MB phone
   * originals.
   */
  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    const supabase = createBrowserClient();
    const added: string[] = [];

    try {
      for (const file of Array.from(files)) {
        const compressed = await downscale(file);
        const path = `${inwardId}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKETS.itemPhotos)
          .upload(path, compressed, { contentType: "image/jpeg", upsert: false });
        if (upErr) throw new Error(upErr.message);
        added.push(path);
      }

      const r = await addItemPhotos(line.itemId, inwardId, added);
      if (!r.ok) throw new Error(r.error);

      const fresh = await listItemPhotos(line.itemId);
      if (fresh.ok) setShots(fresh.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function dropPhoto(id: string) {
    start(async () => {
      const r = await removeItemPhoto(id, inwardId);
      if (r.ok) setShots((p) => p.filter((x) => x.id !== id));
      else setError(r.error);
    });
  }

  const fields = [
    { name: "colourId", label: "Colour", value: line.colourId, opts: options.colours },
    { name: "platingId", label: "Plating", value: line.platingId, opts: options.platings },
    { name: "stoneId", label: "Style", value: line.stoneId, opts: options.stones },
    { name: "sizeId", label: "Size", value: line.sizeId, opts: options.sizes },
  ];

  return (
    <Modal title={line.name} onClose={onClose} width="max-w-lg">
      <form action={save} className="space-y-3">
        <div>
          <Label htmlFor="itemName">Name</Label>
          <Input
            id="itemName"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            required
          />
          <p className="mt-1 text-2xs text-text-muted">
            What the counter searches on and what prints on the customer&rsquo;s bill.
            Vendor shorthand is worth fixing now — it rarely gets fixed later.
          </p>
        </div>

        <div>
          <Label htmlFor="itemPhotos">Photos</Label>
          {shots.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {shots.map((ph) => (
                <div key={ph.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={itemPhotoUrl(ph.storagePath) ?? ""}
                    alt=""
                    className="size-16 rounded-control border border-border object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    disabled={pending}
                    onClick={() => dropPhoto(ph.id)}
                    className="absolute -right-1.5 -top-1.5 size-5 rounded-full border border-border bg-surface text-2xs leading-none hover:border-status-danger-fg hover:text-status-danger-fg"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            id="itemPhotos"
            type="file"
            accept="image/*"
            multiple
            disabled={uploading}
            onChange={(e) => void handleFiles(e.target.files)}
            className="text-2xs"
          />
          {uploading && <p className="mt-1 text-2xs text-text-muted">Uploading…</p>}
        </div>

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
        {error && <FieldError>{error}</FieldError>}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={pending || uploading}>
            {pending ? "Saving…" : "Save"}
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
  discount,
}: {
  inwardId: string;
  existing: AdditionalCost[];
  discount: { kind: "none" | "percent" | "amount"; bps: number | null; paise: number | null };
}) {
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<"none" | "percent" | "amount">(discount.kind);
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

      {/* Invoice discount. Unlike freight this is part of the vendor's
          taxable supply, so it comes off before GST and every line's
          taxable value drops with it. */}
      <label className="ml-2 flex items-center gap-1 border-l border-border pl-3">
        <span className="text-2xs uppercase tracking-wide text-text-subtle">
          Bill disc.
        </span>
        <select
          defaultValue={discount.kind}
          aria-label="Discount type"
          onChange={(e) => {
            const kind = e.target.value as "none" | "percent" | "amount";
            if (kind === "none") {
              start(async () => { await saveInwardDiscount(inwardId, "none", ""); });
            }
            setKind(kind);
          }}
          className="rounded border border-border bg-surface px-1 py-1 text-2xs"
        >
          <option value="none">none</option>
          <option value="percent">%</option>
          <option value="amount">₹</option>
        </select>
        {kind !== "none" && (
          <NarrowInput
            widthClass="w-[72px]"
            inputMode="decimal"
            placeholder={kind === "percent" ? "7" : "0.00"}
            defaultValue={
              discount.kind === "percent" && discount.bps !== null
                ? (discount.bps / 100).toString()
                : discount.kind === "amount" && discount.paise !== null
                  ? (discount.paise / 100).toFixed(2)
                  : ""
            }
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v === "") return;
              start(async () => { await saveInwardDiscount(inwardId, kind, v); });
            }}
            className="tnum py-1 text-right"
          />
        )}
      </label>
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

/**
 * States, in words, exactly what the rate column means.
 *
 * The three price modes produce very different arithmetic from the same
 * typed number, and a pair of abbreviations was not enough to tell them
 * apart. The rule being applied is now written out.
 */
function TaxBanner({ tax }: { tax: InwardTaxSummary }) {
  const rule =
    tax.priceMode === "no_gst"
      ? {
          headline: `${tax.vendorName} does not charge GST`,
          detail:
            "The rate you type is the whole cost. No tax is added and none is backed out.",
          tone: "bg-status-neutral-bg text-status-neutral-fg",
        }
      : tax.priceMode === "gst_inclusive"
        ? {
            headline: `Rate already includes ${tax.gstRate}% GST`,
            detail:
              "Tax is backed out of the number you type, so the invoice total does not change.",
            tone: "bg-status-transit-bg text-status-transit-fg",
          }
        : {
            headline: `${tax.gstRate}% GST is added on top of the rate`,
            detail:
              "The number you type is before tax. GST is added, so the invoice total is higher.",
            tone: "bg-status-approved-bg text-status-approved-fg",
          };

  return (
    <div className={`rounded-card px-3 py-2 ${rule.tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{rule.headline}</p>
          <p className="text-2xs opacity-80">{rule.detail}</p>
        </div>
        <div className="text-right text-2xs">
          {tax.priceMode !== "no_gst" && (
            <p>
              {tax.isInterstate ? "IGST" : "CGST + SGST"}
              {tax.stateName ? ` · vendor in ${tax.stateName}` : ""}
            </p>
          )}
          <p className="opacity-80">
            {tax.itcEligible
              ? "Credit recoverable, tax excluded from landed cost"
              : "Tax loaded into landed cost"}
          </p>
        </div>
      </div>
    </div>
  );
}
