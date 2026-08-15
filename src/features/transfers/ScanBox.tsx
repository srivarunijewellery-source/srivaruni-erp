"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { CameraScanner } from "@/components/ui/CameraScanner";
import { cn } from "@/lib/cn";
import type { ScanResult } from "./actions";
import type { Result } from "@/lib/result";

/**
 * The scanning surface, shared by picking and receiving.
 *
 * Design constraints come from the shop floor, not the browser:
 *
 * - A hardware scanner types the barcode and presses Enter. So this is a
 *   real form with one field, and it must never lose focus, or the next
 *   scan lands in the void and staff carry on scanning a dead box.
 * - Feedback has to be readable at arm's length while holding a carton,
 *   which is why the last result is a large banner and not a toast.
 * - Scans arrive faster than a round trip. Submissions are therefore
 *   queued rather than dropped, and the field clears immediately so the
 *   next tag can be read while the previous one is still in flight.
 */
export function ScanBox({
  transferId,
  action,
  verb,
  disabled,
}: {
  transferId: string;
  action: (fd: FormData) => Promise<Result<ScanResult>>;
  /** "Picked" or "Received" — the past tense shown on success. */
  verb: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [last, setLast] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refocus after every settled scan, and on first paint.
  useEffect(() => {
    if (!pending && !disabled) inputRef.current?.focus();
  }, [pending, disabled, last, error]);

  function submit(barcode: string, delta = 1) {
    const code = barcode.trim();
    if (!code) return;

    start(async () => {
      const fd = new FormData();
      fd.set("transferId", transferId);
      fd.set("barcode", code);
      fd.set("delta", String(delta));

      const result = await action(fd);
      if (result.ok) {
        setLast(result.data);
        setError(null);
      } else {
        setError(result.error);
        setLast(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* The camera goes through the same submit as the keyboard field,
          so a scan behaves identically however it arrived — same
          queueing, same guard against picking more than the shelf holds,
          same banner. */}
      <CameraScanner onScan={(code) => submit(code)} disabled={disabled} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const field = inputRef.current;
          if (!field) return;
          const value = field.value;
          field.value = ""; // clear first, so a fast second scan is not eaten
          submit(value);
        }}
        className="flex gap-2"
      >
        <Input
          ref={inputRef}
          name="barcode"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder="Scan a tag, or type the barcode and press Enter"
          className="h-12 font-mono text-base"
          aria-label="Barcode"
        />
        <Button type="submit" size="lg" variant="primary" disabled={disabled || pending}>
          {pending ? "…" : "Add"}
        </Button>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-card bg-status-danger-bg px-4 py-3 text-status-danger-fg"
        >
          <p className="font-medium">{error}</p>
          <p className="mt-0.5 text-sm">Set that piece aside and carry on with the rest.</p>
        </div>
      )}

      {last && !error && (
        <div
          className={cn(
            "rounded-card px-4 py-3",
            last.isExtra
              ? "bg-status-pending-bg text-status-pending-fg"
              : last.lineComplete
                ? "bg-status-done-bg text-status-done-fg"
                : "bg-status-approved-bg text-status-approved-fg",
          )}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">
              {verb} {last.name}
            </p>
            <p className="tnum font-mono text-lg font-semibold">
              {last.isExtra ? last.counted : `${last.counted} / ${last.target}`}
            </p>
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-mono text-2xs">{last.barcode}</span>
            <span>
              {last.isExtra
                ? "Not on the original request \u2014 added to the box."
                : last.docComplete
                  ? "That is the whole document. Nothing left to scan."
                  : last.remaining > 0
                    ? `${last.remaining} more of this item`
                    : "This item is complete"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => submit(last.barcode, -1)}
            disabled={pending}
            className="mt-2 text-2xs underline underline-offset-2 disabled:opacity-50"
          >
            Undo that scan
          </button>
        </div>
      )}
    </div>
  );
}
