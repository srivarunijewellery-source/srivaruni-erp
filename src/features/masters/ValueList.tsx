"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Field";
import type { MasterRow } from "./queries";

export interface ValueListProps {
  rows: MasterRow[];
  /** Rename in place. */
  onRename: (id: string, next: string) => void;
  onToggle: (row: MasterRow) => void;
  onDelete: (row: MasterRow) => void;
  /** Fold one value into another, moving every item with it. */
  onMerge: (fromId: string, intoId: string) => void;
  addLabel: string;
  onAdd: (value: string) => void;
  pending: boolean;
}

/**
 * A long list of values, laid out to be read rather than scrolled.
 *
 * Seventy-eight categories in a single column is a wall; in three
 * columns sorted by use it becomes a shape you can scan, and the ones
 * that matter are at the top. A search box on top of that is what makes
 * a list this size workable at all.
 *
 * Merge is offered inline because near-duplicates are only visible when
 * the values sit next to each other -- which is exactly when you notice
 * that matilu and metelu are the same thing.
 */
export function ValueList({
  rows,
  onRename,
  onToggle,
  onDelete,
  onMerge,
  addLabel,
  onAdd,
  pending,
}: ValueListProps) {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState("");
  const [mergeFrom, setMergeFrom] = useState<string | null>(null);
  const [mergeInto, setMergeInto] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy] = useTransition();

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t ? rows.filter((r) => r.value.toLowerCase().includes(t)) : rows;
    // Most-used first: the head of the list is where the catalogue
    // actually lives, and the tail is where the strays hide.
    return [...list].sort((a, b) => b.uses - a.uses || a.value.localeCompare(b.value));
  }, [rows, q]);

  const unused = rows.filter((r) => r.uses === 0).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Find among ${rows.length}`}
          className="h-8 max-w-56 text-sm"
        />
        <span className="text-2xs text-text-muted">
          {shown.length} shown
          {unused > 0 && ` · ${unused} unused`}
        </span>
      </div>

      <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((r) => {
          const isMerging = mergeFrom === r.id;
          return (
            <li
              key={r.id}
              className={`rounded-control border px-2 py-1.5 ${
                isMerging ? "border-brand bg-brand-subtle" : "border-border"
              } ${r.active ? "" : "opacity-60"}`}
            >
              <div className="flex items-center gap-1.5">
                <input
                  value={edits[r.id] ?? r.value}
                  onChange={(e) => setEdits((p) => ({ ...p, [r.id]: e.target.value }))}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== r.value) onRename(r.id, e.target.value);
                  }}
                  className="min-w-0 flex-1 rounded-sm bg-transparent px-1 py-0.5 text-sm hover:bg-surface-sunken focus:bg-surface focus:outline focus:outline-1 focus:outline-brand"
                />
                <span
                  className={`tnum shrink-0 text-2xs ${
                    r.uses === 0 ? "text-text-subtle" : "text-text-muted"
                  }`}
                  title={r.uses === 0 ? "Nothing uses this" : `${r.uses} items`}
                >
                  {r.uses}
                </span>
              </div>

              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs text-text-subtle">
                <button
                  type="button"
                  onClick={() => onToggle(r)}
                  className="hover:text-brand"
                >
                  {r.active ? "off" : "on"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMergeFrom(isMerging ? null : r.id);
                    setMergeInto("");
                  }}
                  className="hover:text-brand"
                >
                  merge
                </button>
                {r.uses === 0 && (
                  <button
                    type="button"
                    onClick={() => onDelete(r)}
                    className="hover:text-status-danger-fg"
                  >
                    delete
                  </button>
                )}
              </div>

              {isMerging && (
                <div className="mt-1.5 space-y-1 border-t border-border pt-1.5">
                  <p className="text-2xs text-text-muted">
                    Move {r.uses} item{r.uses === 1 ? "" : "s"} into:
                  </p>
                  <Select
                    value={mergeInto}
                    onChange={(e) => setMergeInto(e.target.value)}
                    className="h-8 w-full py-0 text-2xs"
                  >
                    <option value="">Choose…</option>
                    {rows
                      .filter((x) => x.id !== r.id)
                      .sort((a, b) => a.value.localeCompare(b.value))
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.value} ({x.uses})
                        </option>
                      ))}
                  </Select>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!mergeInto || pending || busy}
                      onClick={() => {
                        onMerge(r.id, mergeInto);
                        setMergeFrom(null);
                      }}
                    >
                      Merge
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setMergeFrom(null)}>
                      Cancel
                    </Button>
                  </div>
                  <p className="text-2xs text-text-subtle">
                    &ldquo;{r.value}&rdquo; disappears. Its items keep their stock and
                    history.
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <div className="min-w-40 flex-1">
          <Label htmlFor={`add-${addLabel}`}>{addLabel}</Label>
          <Input
            id={`add-${addLabel}`}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          disabled={pending || adding.trim().length < 1}
          onClick={() => {
            onAdd(adding);
            setAdding("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
