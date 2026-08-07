"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { deletePriceBand, savePriceBand } from "./actions";
import type { EditableBand } from "./queries";

/**
 * The margin bands offered on the pricing bench.
 *
 * Renaming and adjusting a band stays open even once it has priced
 * items behind it, the same rule as a category: the label is a
 * description, not an identity, and "50-55%" reading differently next
 * season should not need a new row. Deleting is the one thing refused —
 * item_price_history keeps a permanent record of what a piece was
 * priced under, and losing the band would make that record meaningless
 * rather than merely orphaned.
 */
export function PriceBandsEditor({ bands }: { bands: EditableBand[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { label: string; lo: string; hi: string }>>(
    {},
  );

  const [newLabel, setNewLabel] = useState("");
  const [newLo, setNewLo] = useState("");
  const [newHi, setNewHi] = useState("");

  function draftOf(b: EditableBand) {
    return edits[b.id] ?? { label: b.label, lo: String(b.loBps / 100), hi: String(b.hiBps / 100) };
  }

  function save(b: EditableBand, patch: Partial<{ label: string; lo: string; hi: string }>) {
    const draft = { ...draftOf(b), ...patch };
    start(async () => {
      setError(null);
      const r = await savePriceBand({
        id: b.id,
        label: draft.label,
        loPercent: Number(draft.lo) || 0,
        hiPercent: Number(draft.hi) || 0,
        active: b.active,
      });
      if (!r.ok) onError(r.error, b.id, draft);
    });
  }

  function onError(msg: string, id: string, draft: { label: string; lo: string; hi: string }) {
    setError(msg);
    // Keep the rejected edit visible rather than snapping back to the
    // saved value — the owner should not have to retype it to try again.
    setEdits((p) => ({ ...p, [id]: draft }));
  }

  return (
    <Card>
      <CardHeader className="flex items-baseline justify-between gap-2">
        <span className="font-medium">Pricing bands</span>
        <span className="text-2xs text-text-muted">what the pricing bench offers</span>
      </CardHeader>
      <CardBody className="space-y-3">
        {error && <FieldError>{error}</FieldError>}

        <ul className="divide-y divide-border rounded-card border border-border">
          {bands.map((b) => {
            const d = draftOf(b);
            const inUse = b.liveUses > 0 || b.historyUses > 0;
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <Input
                  value={d.label}
                  onChange={(e) => setEdits((p) => ({ ...p, [b.id]: { ...d, label: e.target.value } }))}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== b.label) save(b, { label: e.target.value });
                  }}
                  className="h-8 min-w-28 flex-1 text-sm"
                />
                <div className="flex items-center gap-1">
                  <Input
                    value={d.lo}
                    inputMode="decimal"
                    onChange={(e) => setEdits((p) => ({ ...p, [b.id]: { ...d, lo: e.target.value } }))}
                    onBlur={(e) => {
                      if (e.target.value !== String(b.loBps / 100)) save(b, { lo: e.target.value });
                    }}
                    className="h-8 w-16 text-right font-mono text-sm"
                  />
                  <span className="text-2xs text-text-subtle">–</span>
                  <Input
                    value={d.hi}
                    inputMode="decimal"
                    onChange={(e) => setEdits((p) => ({ ...p, [b.id]: { ...d, hi: e.target.value } }))}
                    onBlur={(e) => {
                      if (e.target.value !== String(b.hiBps / 100)) save(b, { hi: e.target.value });
                    }}
                    className="h-8 w-16 text-right font-mono text-sm"
                  />
                  <span className="text-2xs text-text-subtle">%</span>
                </div>

                {!b.active && <Badge tone="neutral">off</Badge>}
                {inUse && (
                  <span
                    className="text-2xs text-text-subtle"
                    title="Used by pricing rules, the default setting, or past pricing — so it cannot be deleted."
                  >
                    {b.liveUses > 0 && `on ${b.liveUses} rule${b.liveUses === 1 ? "" : "s"}`}
                    {b.liveUses > 0 && b.historyUses > 0 && " · "}
                    {b.historyUses > 0 &&
                      `priced ${b.historyUses} item${b.historyUses === 1 ? "" : "s"}`}
                  </span>
                )}

                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        setError(null);
                        const r = await savePriceBand({
                          id: b.id,
                          label: b.label,
                          loPercent: b.loBps / 100,
                          hiPercent: b.hiBps / 100,
                          active: !b.active,
                        });
                        if (!r.ok) setError(r.error);
                      })
                    }
                    className="rounded-control border border-border px-2 py-0.5 text-2xs hover:border-brand hover:text-brand"
                  >
                    {b.active ? "turn off" : "turn on"}
                  </button>
                  {!inUse && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          setError(null);
                          const r = await deletePriceBand(b.id);
                          if (!r.ok) setError(r.error);
                        })
                      }
                      className="rounded-control px-2 py-0.5 text-2xs text-text-subtle hover:text-status-danger-fg"
                    >
                      delete
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-28 flex-1">
            <Label htmlFor="bandLabel">New band</Label>
            <Input
              id="bandLabel"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="70 – 75%"
            />
          </div>
          <div>
            <Label htmlFor="bandLo">From %</Label>
            <Input
              id="bandLo"
              value={newLo}
              onChange={(e) => setNewLo(e.target.value)}
              inputMode="decimal"
              className="w-20 font-mono"
            />
          </div>
          <div>
            <Label htmlFor="bandHi">To %</Label>
            <Input
              id="bandHi"
              value={newHi}
              onChange={(e) => setNewHi(e.target.value)}
              inputMode="decimal"
              className="w-20 font-mono"
            />
          </div>
          <Button
            variant="secondary"
            disabled={pending || newLabel.trim().length < 1 || !newLo || !newHi}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await savePriceBand({
                  id: null,
                  label: newLabel,
                  loPercent: Number(newLo) || 0,
                  hiPercent: Number(newHi) || 0,
                  active: true,
                });
                if (r.ok) {
                  setNewLabel("");
                  setNewLo("");
                  setNewHi("");
                } else setError(r.error);
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
