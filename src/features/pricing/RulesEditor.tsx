"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FieldError, Label, Input, Select } from "@/components/ui/Field";
import { Tag } from "@/components/ui/Tag";
import { deleteRule, saveRule } from "./actions";
import type {
  Category, ItemTypeOption, PriceBand, PricingRule,
} from "@/types/domain";

/**
 * Pricing rules.
 *
 * Scope is vendor, category and item type. There is no separate "brand"
 * axis because in this business the brand IS the item type, and a second
 * column meaning the same thing is a column that eventually disagrees
 * with the first.
 *
 * The most specific matching rule wins, and specificity is counted, not
 * hand-ordered — so adding a rule can never silently reshuffle the
 * others. Two rules covering the identical combination are rejected by a
 * unique index rather than resolved by row order.
 */
export function RulesEditor({
  rules,
  bands,
  categories,
  itemTypes,
  vendors,
}: {
  rules: PricingRule[];
  bands: PriceBand[];
  categories: Category[];
  itemTypes: ItemTypeOption[];
  vendors: Array<{ id: string; name: string }>;
}) {
  const [name, setName] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [itemTypeId, setItemTypeId] = useState("");
  const [bandId, setBandId] = useState(bands[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const typesForCategory = categoryId
    ? itemTypes.filter((t) => t.categoryId === categoryId)
    : itemTypes;

  async function add() {
    setBusy(true);
    setError(null);
    const res = await saveRule({
      name,
      vendorId: vendorId || null,
      categoryId: categoryId || null,
      itemTypeId: itemTypeId || null,
      bandId,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setName(""); setVendorId(""); setCategoryId(""); setItemTypeId("");
  }

  async function remove(id: string) {
    setBusy(true);
    const res = await deleteRule(id);
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <Card>
        <CardHeader>
          <h2 className="font-medium">Rules, most specific first</h2>
        </CardHeader>
        <CardBody className="p-0">
          {rules.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-text-muted">
              No rules yet. Until there are, the pricing screen falls back to the
              band chosen there by hand.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-sunken text-2xs uppercase tracking-wide text-text-muted">
                  <th className="px-3 py-1.5 text-left">Rule</th>
                  <th className="px-3 py-1.5 text-left">Applies to</th>
                  <th className="px-3 py-1.5 text-left">Band</th>
                  <th className="px-3 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {r.vendorName && <Tag>{r.vendorName}</Tag>}
                        {r.categoryName && <Tag>{r.categoryName}</Tag>}
                        {r.itemTypeName && <Tag>{r.itemTypeName}</Tag>}
                        {!r.vendorName && !r.categoryName && !r.itemTypeName && (
                          <Tag muted>Everything</Tag>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone="approved">{r.bandLabel}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => remove(r.id)}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <h2 className="font-medium">New rule</h2>
        </CardHeader>
        <CardBody className="space-y-3">
          <div>
            <Label htmlFor="rname">Name</Label>
            <Input
              id="rname"
              value={name}
              placeholder="Jaipur antique sets"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="rvendor">Vendor</Label>
            <Select id="rvendor" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">Any</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="rcat">Category</Label>
            <Select
              id="rcat"
              value={categoryId}
              onChange={(e) => { setCategoryId(e.target.value); setItemTypeId(""); }}
            >
              <option value="">Any</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="rtype">Item type</Label>
            <Select id="rtype" value={itemTypeId} onChange={(e) => setItemTypeId(e.target.value)}>
              <option value="">Any</option>
              {typesForCategory.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="rband">Margin band</Label>
            <Select id="rband" value={bandId} onChange={(e) => setBandId(e.target.value)}>
              {bands.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </Select>
          </div>

          <FieldError>{error}</FieldError>

          <Button variant="primary" fullWidth disabled={busy || !name} onClick={add}>
            {busy ? "Saving…" : "Add rule"}
          </Button>
          <p className="text-2xs text-text-muted">
            Leaving a field on Any widens the rule. A rule naming all three
            beats one naming two, which beats one naming one.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
