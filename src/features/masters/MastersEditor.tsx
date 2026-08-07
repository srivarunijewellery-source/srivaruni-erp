"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import {
  deleteMaster,
  saveAttributeOption,
  saveCategory,
  saveItemType,
} from "./actions";
import type { CategoryRow, MasterRow, MastersData, TypeRow } from "./queries";

type AttrKey = "colour" | "plating" | "stone" | "size";

/**
 * The lists everything else is built from.
 *
 * The rule throughout: a value nothing uses can be deleted; a value in
 * use can be renamed or turned off but never removed. Deleting one would
 * orphan the pieces pointing at it, and an item with no category cannot
 * be priced or found. Rather than let that fail on click, the delete
 * button is simply absent once anything depends on the row, and the
 * count is shown so it is obvious why.
 *
 * Renaming stays open on purpose. A category called "Long Neck Set" that
 * should read "Long Haram" is the same category — the name is a label,
 * not an identity, and forcing a new row would split its history in two.
 */
export function MastersEditor({ data }: { data: MastersData }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
          {error}
        </p>
      )}

      <Categories rows={data.categories} onError={setError} />
      <ItemTypes rows={data.itemTypes} categories={data.categories} onError={setError} />

      <Attributes label="Colours"  attrKey="colour"  rows={data.colours}  onError={setError} />
      <Attributes label="Plating"  attrKey="plating" rows={data.platings} onError={setError} />
      <Attributes label="Stones"   attrKey="stone"   rows={data.stones}   onError={setError} />
      <Attributes label="Sizes"    attrKey="size"    rows={data.sizes}    onError={setError} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function UsageNote({ uses }: { uses: number }) {
  if (uses === 0) {
    return <span className="text-2xs text-text-subtle">unused</span>;
  }
  return (
    <span className="text-2xs text-text-muted" title="In use, so it cannot be deleted.">
      on {uses} item{uses === 1 ? "" : "s"}
    </span>
  );
}

function RowActions({
  kind,
  id,
  uses,
  active,
  onToggle,
  onError,
}: {
  kind: string;
  id: string;
  uses: number;
  active: boolean;
  onToggle: () => void;
  onError: (m: string | null) => void;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <UsageNote uses={uses} />
      <button
        type="button"
        onClick={onToggle}
        className="rounded-control border border-border px-2 py-0.5 text-2xs hover:border-brand hover:text-brand"
      >
        {active ? "turn off" : "turn on"}
      </button>
      {uses === 0 && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              onError(null);
              const r = await deleteMaster(kind, id);
              if (!r.ok) onError(r.error);
            })
          }
          className="rounded-control px-2 py-0.5 text-2xs text-text-subtle hover:text-status-danger-fg"
        >
          delete
        </button>
      )}
    </div>
  );
}

function Categories({
  rows,
  onError,
}: {
  rows: CategoryRow[];
  onError: (m: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [hsn, setHsn] = useState("7117");
  const [gst, setGst] = useState("3");
  const [markup, setMarkup] = useState("2.5");
  const [edit, setEdit] = useState<Record<string, string>>({});

  const save = (row: CategoryRow, next: string) =>
    start(async () => {
      onError(null);
      const r = await saveCategory({
        id: row.id,
        name: next,
        hsn: row.hsn,
        gstRate: row.gstRate,
        markupMultiplier: row.markupMultiplier,
        active: row.active,
      });
      if (!r.ok) onError(r.error);
    });

  return (
    <Card>
      <CardHeader className="font-medium">Categories</CardHeader>
      <CardBody className="space-y-3">
        <ul className="divide-y divide-border rounded-card border border-border">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <Input
                value={edit[c.id] ?? c.value}
                onChange={(e) => setEdit((p) => ({ ...p, [c.id]: e.target.value }))}
                onBlur={(e) => {
                  if (e.target.value.trim() !== c.value) save(c, e.target.value);
                }}
                className="h-8 min-w-40 flex-1 text-sm"
              />
              <span className="font-mono text-2xs text-text-subtle">
                HSN {c.hsn} · {c.gstRate}% · ×{c.markupMultiplier}
              </span>
              {!c.active && <Badge tone="neutral">off</Badge>}
              <RowActions
                kind="category"
                id={c.id}
                uses={c.uses}
                active={c.active}
                onError={onError}
                onToggle={() =>
                  start(async () => {
                    const r = await saveCategory({
                      id: c.id,
                      name: c.value,
                      hsn: c.hsn,
                      gstRate: c.gstRate,
                      markupMultiplier: c.markupMultiplier,
                      active: !c.active,
                    });
                    if (!r.ok) onError(r.error);
                  })
                }
              />
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1">
            <Label htmlFor="newCat">New category</Label>
            <Input
              id="newCat"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Long Haram"
            />
          </div>
          <div>
            <Label htmlFor="newHsn">HSN</Label>
            <Input id="newHsn" value={hsn} onChange={(e) => setHsn(e.target.value)} className="w-24 font-mono" />
          </div>
          <div>
            <Label htmlFor="newGst">GST %</Label>
            <Input id="newGst" value={gst} onChange={(e) => setGst(e.target.value)} className="w-20 font-mono" />
          </div>
          <div>
            <Label htmlFor="newMk">Markup</Label>
            <Input id="newMk" value={markup} onChange={(e) => setMarkup(e.target.value)} className="w-20 font-mono" />
          </div>
          <Button
            variant="secondary"
            disabled={pending || name.trim().length < 2}
            onClick={() =>
              start(async () => {
                onError(null);
                const r = await saveCategory({
                  id: null,
                  name,
                  hsn,
                  gstRate: Number(gst) || 3,
                  markupMultiplier: Number(markup) || 2.5,
                  active: true,
                });
                if (r.ok) setName("");
                else onError(r.error);
              })
            }
          >
            Add
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function ItemTypes({
  rows,
  categories,
  onError,
}: {
  rows: TypeRow[];
  categories: CategoryRow[];
  onError: (m: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [edit, setEdit] = useState<Record<string, string>>({});

  return (
    <Card>
      <CardHeader className="flex items-baseline justify-between gap-2">
        <span className="font-medium">Item types</span>
        <span className="text-2xs text-text-muted">each belongs to a category</span>
      </CardHeader>
      <CardBody className="space-y-3">
        <ul className="divide-y divide-border rounded-card border border-border">
          {rows.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <Input
                value={edit[t.id] ?? t.value}
                onChange={(e) => setEdit((p) => ({ ...p, [t.id]: e.target.value }))}
                onBlur={(e) => {
                  if (e.target.value.trim() !== t.value) {
                    start(async () => {
                      const r = await saveItemType({
                        id: t.id,
                        categoryId: t.categoryId,
                        name: e.target.value,
                        active: t.active,
                      });
                      if (!r.ok) onError(r.error);
                    });
                  }
                }}
                className="h-8 min-w-36 flex-1 text-sm"
              />
              <Select
                value={t.categoryId}
                onChange={(e) =>
                  start(async () => {
                    const r = await saveItemType({
                      id: t.id,
                      categoryId: e.target.value,
                      name: t.value,
                      active: t.active,
                    });
                    if (!r.ok) onError(r.error);
                  })
                }
                className="h-8 w-44 py-0 text-2xs"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.value}</option>
                ))}
              </Select>
              {!t.active && <Badge tone="neutral">off</Badge>}
              <RowActions
                kind="item_type"
                id={t.id}
                uses={t.uses}
                active={t.active}
                onError={onError}
                onToggle={() =>
                  start(async () => {
                    const r = await saveItemType({
                      id: t.id,
                      categoryId: t.categoryId,
                      name: t.value,
                      active: !t.active,
                    });
                    if (!r.ok) onError(r.error);
                  })
                }
              />
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-36 flex-1">
            <Label htmlFor="newType">New item type</Label>
            <Input
              id="newType"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Long Haram"
            />
          </div>
          <div>
            <Label htmlFor="newTypeCat">Category</Label>
            <Select
              id="newTypeCat"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-44"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.value}</option>
              ))}
            </Select>
          </div>
          <Button
            variant="secondary"
            disabled={pending || name.trim().length < 2 || !categoryId}
            onClick={() =>
              start(async () => {
                onError(null);
                const r = await saveItemType({ id: null, categoryId, name, active: true });
                if (r.ok) setName("");
                else onError(r.error);
              })
            }
          >
            Add
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function Attributes({
  label,
  attrKey,
  rows,
  onError,
}: {
  label: string;
  attrKey: AttrKey;
  rows: MasterRow[];
  onError: (m: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState("");
  const [edit, setEdit] = useState<Record<string, string>>({});

  return (
    <Card>
      <CardHeader className="font-medium">{label}</CardHeader>
      <CardBody className="space-y-3">
        <ul className="divide-y divide-border rounded-card border border-border">
          {rows.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <Input
                value={edit[a.id] ?? a.value}
                onChange={(e) => setEdit((p) => ({ ...p, [a.id]: e.target.value }))}
                onBlur={(e) => {
                  if (e.target.value.trim() !== a.value) {
                    start(async () => {
                      const r = await saveAttributeOption({
                        id: a.id,
                        key: attrKey,
                        value: e.target.value,
                        active: a.active,
                      });
                      if (!r.ok) onError(r.error);
                    });
                  }
                }}
                className="h-8 min-w-36 flex-1 text-sm"
              />
              {!a.active && <Badge tone="neutral">off</Badge>}
              <RowActions
                kind={`attr:${attrKey}`}
                id={a.id}
                uses={a.uses}
                active={a.active}
                onError={onError}
                onToggle={() =>
                  start(async () => {
                    const r = await saveAttributeOption({
                      id: a.id,
                      key: attrKey,
                      value: a.value,
                      active: !a.active,
                    });
                    if (!r.ok) onError(r.error);
                  })
                }
              />
            </li>
          ))}
          {rows.length === 0 && (
            <li className="px-3 py-3 text-sm text-text-muted">Nothing here yet.</li>
          )}
        </ul>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-36 flex-1">
            <Label htmlFor={`new-${attrKey}`}>Add {label.toLowerCase()}</Label>
            <Input
              id={`new-${attrKey}`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            disabled={pending || value.trim().length < 1}
            onClick={() =>
              start(async () => {
                onError(null);
                const r = await saveAttributeOption({
                  id: null,
                  key: attrKey,
                  value,
                  active: true,
                });
                if (r.ok) setValue("");
                else onError(r.error);
              })
            }
          >
            Add
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
