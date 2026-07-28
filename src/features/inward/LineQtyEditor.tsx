"use client";

import { useState, useTransition } from "react";
import { updateInwardLineQty } from "./actions";
import { cn } from "@/lib/cn";

/**
 * Inline quantity edit on the document itself.
 *
 * Saves on blur or Enter rather than behind a Save button: staff are
 * correcting a miscount while holding the piece, and an extra click per
 * line across a 40-line carton is the difference between using the
 * system and writing it on paper.
 */
export function LineQtyEditor({
  lineId,
  inwardId,
  qty,
  editable,
}: {
  lineId: string;
  inwardId: string;
  qty: number;
  editable: boolean;
}) {
  const [value, setValue] = useState(String(qty));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!editable) return <span className="tnum">{qty}</span>;

  const commit = () => {
    const next = Number(value);
    if (!Number.isInteger(next) || next < 1) {
      setValue(String(qty));
      setError(null);
      return;
    }
    if (next === qty) return;

    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("lineId", lineId);
      fd.set("inwardId", inwardId);
      fd.set("qty", String(next));
      const result = await updateInwardLineQty(fd);
      if (!result.ok) {
        setError(result.error);
        setValue(String(qty));
      }
    });
  };

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <input
        type="number"
        min={1}
        inputMode="numeric"
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setValue(String(qty));
        }}
        aria-label="Quantity received"
        className={cn(
          "tnum w-16 rounded-control border border-border bg-surface px-2 py-1 text-right text-sm",
          "focus:border-brand focus:outline-none disabled:opacity-50",
        )}
      />
      {error && <span className="text-2xs text-status-danger-fg">{error}</span>}
    </span>
  );
}
