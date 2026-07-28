"use client";

import { useState, useTransition } from "react";
import { adjustQty } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import type { StoreLocation } from "@/types/domain";

/**
 * Corrects on-hand quantity for one item at one store.
 *
 * The reason is mandatory and the difference posts as a stock adjustment
 * document, not a silent balance write. That is the whole point: a
 * count correction on the catalog screen has to be as traceable as one
 * raised on the shop floor.
 */
export function QtyAdjuster({
  itemId,
  stores,
  current,
}: {
  itemId: string;
  stores: StoreLocation[];
  current: Array<{ code: string; qty: number }>;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Adjust quantity
      </Button>
    );
  }

  return (
    <form
      action={(fd) =>
        start(async () => {
          setError(null);
          setResult(null);
          fd.set("itemId", itemId);
          const r = await adjustQty(fd);
          if (r.ok) {
            setResult(
              r.data === 0
                ? "No change."
                : `${r.data > 0 ? "Added" : "Removed"} ${Math.abs(r.data)}. Logged as a stock adjustment.`,
            );
          } else {
            setError(r.error);
          }
        })
      }
      className="space-y-3 rounded-card border border-border bg-surface-sunken p-3"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="locationId">Store</Label>
          <Select id="locationId" name="locationId" required>
            {stores.map((s) => {
              const held = current.find((c) => c.code === s.code)?.qty ?? 0;
              return (
                <option key={s.id} value={s.id}>
                  {s.name} (has {held})
                </option>
              );
            })}
          </Select>
        </div>
        <div>
          <Label htmlFor="newQty">Counted quantity</Label>
          <Input
            id="newQty"
            name="newQty"
            inputMode="numeric"
            className="tnum text-right"
            required
          />
        </div>
      </div>

      <div>
        <Label htmlFor="reason">Reason</Label>
        <Input
          id="reason"
          name="reason"
          placeholder="Physical count, breakage, correction…"
          required
        />
      </div>

      {result && <p className="text-sm text-status-done-fg">{result}</p>}
      {error && <FieldError>{error}</FieldError>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={pending}>
          {pending ? "Posting…" : "Post adjustment"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Done
        </Button>
      </div>
    </form>
  );
}
