"use client";

import { useRouter } from "next/navigation";
import { ROUTES } from "@/config/nav";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FieldError, Input, Label, Select } from "@/components/ui/Field";
import { parseRupeesToPaise } from "@/lib/money";
import { parsePercentToBps } from "@/lib/pricing";
import { saveScheme } from "./actions";
import { todayIso } from "@/lib/dates";
import type {
  AttributeOption, Category, DiscountScope, DiscountValueKind,
  ItemTypeOption, StoreLocation, DiscountScheme } from "@/types/domain";

interface Target {
  categoryId?: string | null;
  itemTypeId?: string | null;
  vendorId?: string | null;
  platingId?: string | null;
  stoneId?: string | null;
  colourId?: string | null;
  sizeId?: string | null;
}

/**
 * Two shapes of offer, and the difference matters.
 *
 * A SELECTION offer attaches to products chosen by category, item type
 * or vendor — the filters already used everywhere else in this system.
 * A WHOLE BILL offer attaches to the invoice total and therefore cannot
 * carry product targets at all; the form hides them rather than letting
 * someone build a scheme the database will reject.
 */
export function SchemeForm({
  categories,
  itemTypes,
  vendors,
  platings,
  stones,
  colours,
  sizes,
  locations,
  maxPercentBps,
  maxDays,
  editing,
}: {
  categories: Category[];
  itemTypes: ItemTypeOption[];
  vendors: Array<{ id: string; name: string }>;
  // Offers get described by attribute far more often than by category:
  // "20% off rose gold" is the normal shape of a festival campaign.
  platings: AttributeOption[];
  stones: AttributeOption[];
  colours: AttributeOption[];
  sizes: AttributeOption[];
  locations: StoreLocation[];
  maxPercentBps: number;
  maxDays: number;
  /** An existing scheme being changed. Owner only. */
  editing?: DiscountScheme | null;
}) {
  const router = useRouter();
  const today = todayIso();

  /**
   * Loaded from the scheme being edited, or blank for a new one.
   *
   * A running campaign gets extended far more often than it gets
   * replaced -- the festival ran long, the stock did not move -- and
   * forcing a new scheme for that would leave two overlapping offers
   * fighting over the same bill.
   */
  const [name, setName] = useState(editing?.name ?? "");
  const [scope, setScope] = useState<DiscountScope>(editing?.scope ?? "selection");
  const [valueKind, setValueKind] = useState<DiscountValueKind>(
    editing?.valueKind ?? "percent",
  );
  const [valueText, setValueText] = useState(
    editing
      ? editing.valueKind === "percent"
        ? String((editing.valueBps ?? 0) / 100)
        : String((editing.valuePaise ?? 0) / 100)
      : "",
  );
  const [startsOn, setStartsOn] = useState(editing?.startsOn ?? today);
  const [endsOn, setEndsOn] = useState(editing?.endsOn ?? today);
  const [minBillText, setMinBillText] = useState(
    editing?.minBillPaise ? String(editing.minBillPaise / 100) : "",
  );
  const [maxDiscountText, setMaxDiscountText] = useState(
    editing?.maxDiscountPaise ? String(editing.maxDiscountPaise / 100) : "",
  );
  const [priority, setPriority] = useState(String(editing?.priority ?? 100));
  const [locationIds, setLocationIds] = useState<string[]>(
    editing?.locationIds ?? [],
  );
  const [targets, setTargets] = useState<Target[]>(
    // Prefilled when editing. saveScheme replaces the target list
    // wholesale, so starting empty would silently strip the products an
    // offer applies to and quietly widen it to everything.
    (editing?.targets ?? []).map((t) => ({
      categoryId: t.categoryId ?? undefined,
      itemTypeId: t.itemTypeId ?? undefined,
      vendorId: t.vendorId ?? undefined,
      itemId: t.itemId ?? undefined,
    })),
  );
  const [draft, setDraft] = useState<Target>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const typesForDraft = draft.categoryId
    ? itemTypes.filter((t) => t.categoryId === draft.categoryId)
    : itemTypes;

  const days =
    Math.round((Date.parse(endsOn) - Date.parse(startsOn)) / 86_400_000) + 1;

  function addTarget() {
    if (!draft.categoryId && !draft.itemTypeId && !draft.vendorId) return;
    setTargets((t) => [...t, draft]);
    setDraft({});
  }

  async function submit() {
    setBusy(true); setError(null); setMsg(null);
    const res = await saveScheme({
      id: editing?.id,
      name,
      scope,
      valueKind,
      valueBps: valueKind === "percent" ? parsePercentToBps(valueText) : null,
      valuePaise: valueKind === "amount" ? parseRupeesToPaise(valueText) : null,
      startsOn,
      endsOn,
      priority: Number(priority),
      stackable: false,
      minBillPaise: minBillText ? parseRupeesToPaise(minBillText) ?? 0 : 0,
      maxDiscountPaise: maxDiscountText ? parseRupeesToPaise(maxDiscountText) : null,
      locationIds: locationIds.length > 0 ? locationIds : null,
      targets: scope === "invoice" ? [] : targets,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }

    if (editing) {
      setMsg("Offer updated.");
      router.push(ROUTES.discounts);
      return;
    }

    setMsg("Offer saved.");
    setName(""); setValueText(""); setTargets([]); setMinBillText("");
    setMaxDiscountText("");
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">{editing ? `Editing ${editing.name}` : "New offer"}</h2>
        {editing && (
          <button
            type="button"
            onClick={() => router.push(ROUTES.discounts)}
            className="text-2xs text-text-muted hover:text-brand"
          >
            cancel and start a new one
          </button>
        )}
      </CardHeader>
      <CardBody className="space-y-3">
        <div>
          <Label htmlFor="dname">Name</Label>
          <Input
            id="dname"
            value={name}
            placeholder="Ashadam sale"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="dscope">Applies to</Label>
          <Select
            id="dscope"
            value={scope}
            onChange={(e) => setScope(e.target.value as DiscountScope)}
          >
            <option value="selection">A selection of products</option>
            <option value="invoice">The whole bill</option>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="dkind">Discount</Label>
            <Select
              id="dkind"
              value={valueKind}
              onChange={(e) => setValueKind(e.target.value as DiscountValueKind)}
            >
              <option value="percent">Percentage</option>
              <option value="amount">Flat amount</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="dval">{valueKind === "percent" ? "Percent" : "Rupees"}</Label>
            <Input
              id="dval"
              inputMode="decimal"
              value={valueText}
              placeholder={valueKind === "percent" ? "20" : "500"}
              onChange={(e) => setValueText(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="dfrom">Starts</Label>
            <Input id="dfrom" type="date" value={startsOn}
                   onChange={(e) => setStartsOn(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="dto">Ends</Label>
            <Input id="dto" type="date" value={endsOn}
                   onChange={(e) => setEndsOn(e.target.value)} />
          </div>
        </div>
        {Number.isFinite(days) && days > maxDays && (
          <p className="text-2xs text-status-danger-fg">
            That is {days} days. Settings cap a campaign at {maxDays}.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="dmin">Minimum bill</Label>
            <Input id="dmin" inputMode="decimal" value={minBillText}
                   placeholder="0" onChange={(e) => setMinBillText(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="dcap">Cap the discount at</Label>
            <Input id="dcap" inputMode="decimal" value={maxDiscountText}
                   placeholder="none" onChange={(e) => setMaxDiscountText(e.target.value)} />
          </div>
        </div>

        <div>
          <Label htmlFor="dpri">Priority</Label>
          <Input id="dpri" inputMode="numeric" value={priority}
                 onChange={(e) => setPriority(e.target.value)} />
          <p className="mt-1 text-2xs text-text-muted">
            When two offers match the same item, the higher number wins.
          </p>
        </div>

        <fieldset>
          <legend className="mb-1 block text-sm font-medium">Stores</legend>
          <div className="flex flex-wrap gap-3">
            {locations.map((l) => (
              <label key={l.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={locationIds.includes(l.id)}
                  onChange={(e) =>
                    setLocationIds((ids) =>
                      e.target.checked ? [...ids, l.id] : ids.filter((x) => x !== l.id))
                  }
                />
                {l.code}
              </label>
            ))}
          </div>
          <p className="mt-1 text-2xs text-text-muted">
            None ticked means every store.
          </p>
        </fieldset>

        {scope === "selection" && (
          <div className="space-y-2 border-t border-border pt-3">
            <Label>Which products</Label>

            {targets.length === 0 ? (
              <p className="text-2xs text-text-muted">
                Nothing added yet — as it stands this offer covers every product.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {targets.map((t, i) => (
                  <li key={i} className="flex items-center justify-between gap-2
                                         rounded-control bg-surface-sunken px-2 py-1">
                    <span>
                      {[
                        vendors.find((v) => v.id === t.vendorId)?.name,
                        categories.find((c) => c.id === t.categoryId)?.name,
                        itemTypes.find((x) => x.id === t.itemTypeId)?.name,
                        platings.find((x) => x.id === t.platingId)?.value,
                        stones.find((x) => x.id === t.stoneId)?.value,
                        colours.find((x) => x.id === t.colourId)?.value,
                        sizes.find((x) => x.id === t.sizeId)?.value,
                      ].filter(Boolean).join(" · ")}
                    </span>
                    <button
                      type="button"
                      className="text-2xs text-text-muted hover:text-status-danger-fg"
                      onClick={() => setTargets((ts) => ts.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="grid grid-cols-3 gap-2">
              <Select
                value={draft.vendorId ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, vendorId: e.target.value || null }))}
              >
                <option value="">Any vendor</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
              <Select
                value={draft.categoryId ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, categoryId: e.target.value || null, itemTypeId: null })}
              >
                <option value="">Any category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select
                value={draft.itemTypeId ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, itemTypeId: e.target.value || null }))}
              >
                <option value="">Any type</option>
                {typesForDraft.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <Select
                value={draft.platingId ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, platingId: e.target.value || null }))}
              >
                <option value="">Any plating</option>
                {platings.map((o) => <option key={o.id} value={o.id}>{o.value}</option>)}
              </Select>
              <Select
                value={draft.stoneId ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, stoneId: e.target.value || null }))}
              >
                <option value="">Any stone</option>
                {stones.map((o) => <option key={o.id} value={o.id}>{o.value}</option>)}
              </Select>
              <Select
                value={draft.colourId ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, colourId: e.target.value || null }))}
              >
                <option value="">Any colour</option>
                {colours.map((o) => <option key={o.id} value={o.id}>{o.value}</option>)}
              </Select>
              <Select
                value={draft.sizeId ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, sizeId: e.target.value || null }))}
              >
                <option value="">Any size</option>
                {sizes.map((o) => <option key={o.id} value={o.id}>{o.value}</option>)}
              </Select>
            </div>

            <Button size="sm" onClick={addTarget}>Add this selection</Button>
            <p className="text-2xs text-text-muted">
              Within one line every field must match. Across lines, any match counts.
            </p>
          </div>
        )}

        <FieldError>{error}</FieldError>
        {msg && <p className="text-sm text-status-done-fg">{msg}</p>}

        <Button variant="primary" fullWidth disabled={busy || !name} onClick={submit}>
          {busy ? "Saving…" : "Save offer"}
        </Button>
        <p className="text-2xs text-text-muted">
          Ceiling is {(maxPercentBps / 100).toFixed(0)}%. Whatever is set here,
          no offer may take a line below the margin floor.
        </p>
      </CardBody>
    </Card>
  );
}
