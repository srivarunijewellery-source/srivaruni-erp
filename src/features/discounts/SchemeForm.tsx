"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FieldError, Input, Label, Select } from "@/components/ui/Field";
import { parseRupeesToPaise } from "@/lib/money";
import { parsePercentToBps } from "@/lib/pricing";
import { saveScheme } from "./actions";
import type {
  Category, DiscountScope, DiscountValueKind, ItemTypeOption, StoreLocation,
} from "@/types/domain";

interface Target {
  categoryId?: string | null;
  itemTypeId?: string | null;
  vendorId?: string | null;
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
  locations,
  maxPercentBps,
  maxDays,
}: {
  categories: Category[];
  itemTypes: ItemTypeOption[];
  vendors: Array<{ id: string; name: string }>;
  locations: StoreLocation[];
  maxPercentBps: number;
  maxDays: number;
}) {
  const today = new Date().toISOString().slice(0, 10);

  const [name, setName] = useState("");
  const [scope, setScope] = useState<DiscountScope>("selection");
  const [valueKind, setValueKind] = useState<DiscountValueKind>("percent");
  const [valueText, setValueText] = useState("");
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(today);
  const [minBillText, setMinBillText] = useState("");
  const [maxDiscountText, setMaxDiscountText] = useState("");
  const [priority, setPriority] = useState("100");
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
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
    setMsg("Offer saved.");
    setName(""); setValueText(""); setTargets([]); setMinBillText("");
    setMaxDiscountText("");
  }

  return (
    <Card>
      <CardHeader><h2 className="font-medium">New offer</h2></CardHeader>
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
