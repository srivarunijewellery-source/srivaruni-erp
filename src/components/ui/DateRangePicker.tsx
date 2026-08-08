"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/Field";
import {
  addDays,
  financialYear,
  isValidIsoDate,
  lastMonth,
  monthStart,
  prettyDate,
  todayIso,
  EARLIEST_DATE,
} from "@/lib/dates";

/**
 * One date range control for every report.
 *
 * The pages that had their own each did the same damaging thing:
 *
 *   <Input type="date" value={from} onChange={e => router.push(...)} />
 *
 * A native date input fires change on EVERY segment you edit. Typing a
 * year emits 0002, 0020, 0202, 2026 — four navigations, four server
 * renders, four database queries, and the first three ask for a range
 * covering the entire ledger. Twenty of those in a burst is what pushed
 * the profit and loss page past the 8 second statement timeout and threw
 * a server render error into the owner's face.
 *
 * Worse for the person using it: `value` is a server prop, so it does
 * not update until the round trip lands. The field visibly snaps back to
 * the old date while you are still picking, which reads as the calendar
 * being broken. It was not; it was being overwritten.
 *
 * So: the inputs hold their own state and commit on blur or Enter. The
 * navigation runs inside a transition, the controls disable while it is
 * in flight, and presets cover the cases that are actually common —
 * nobody types a date to mean "this month".
 */
export function DateRangePicker({
  basePath,
  from,
  to,
  /** Preserved across a date change, so picking a branch and then a date
   *  does not throw the branch away. */
  params = {},
  maxDays,
}: {
  basePath: string;
  from: string;
  to: string;
  params?: Record<string, string>;
  maxDays?: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [note, setNote] = useState<string | null>(null);

  // The server is the source of truth. When it comes back with a range
  // different from what was typed — clamped, swapped, shortened — the
  // fields follow it rather than arguing with it.
  useEffect(() => {
    setDraftFrom(from);
    setDraftTo(to);
  }, [from, to]);

  const today = todayIso();

  function go(nextFrom: string, nextTo: string) {
    if (!isValidIsoDate(nextFrom) || !isValidIsoDate(nextTo)) {
      setNote("Enter both dates before this can update.");
      return;
    }
    if (nextFrom === from && nextTo === to) return;
    setNote(null);
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    qs.set("from", nextFrom);
    qs.set("to", nextTo);
    start(() => router.push(`${basePath}?${qs.toString()}`, { scroll: false }));
  }

  const presets: Array<[string, () => [string, string]]> = [
    ["Today", () => [today, today]],
    ["Yesterday", () => [addDays(today, -1), addDays(today, -1)]],
    ["7 days", () => [addDays(today, -6), today]],
    ["30 days", () => [addDays(today, -29), today]],
    ["This month", () => [monthStart(today), today]],
    ["Last month", () => lastMonth(today)],
    ["This FY", () => [financialYear(today)[0], today]],
  ];

  const span =
    isValidIsoDate(from) && isValidIsoDate(to)
      ? Math.round(
          (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000,
        ) + 1
      : 0;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {presets.map(([label, fn]) => {
          const [f, t] = fn();
          const active = f === from && t === to;
          return (
            <button
              key={label}
              type="button"
              disabled={pending}
              onClick={() => go(f, t)}
              className={`rounded-full px-3 py-1.5 text-2xs transition-colors disabled:opacity-50 ${
                active
                  ? "bg-brand text-brand-fg"
                  : "border border-border hover:border-brand hover:text-brand"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t border-border pt-2.5">
        <div>
          <Label htmlFor="range-from">From</Label>
          <input
            id="range-from"
            type="date"
            value={draftFrom}
            min={EARLIEST_DATE}
            max={draftTo || today}
            disabled={pending}
            onChange={(e) => setDraftFrom(e.target.value)}
            // Commit on blur, not on change. This one line is the fix.
            onBlur={() => go(draftFrom, draftTo)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                go(draftFrom, draftTo);
              }
            }}
            className="h-9 w-44 rounded-control border border-border bg-surface px-2 font-mono text-sm disabled:opacity-50"
          />
        </div>
        <div>
          <Label htmlFor="range-to">To</Label>
          <input
            id="range-to"
            type="date"
            value={draftTo}
            min={draftFrom || EARLIEST_DATE}
            disabled={pending}
            onChange={(e) => setDraftTo(e.target.value)}
            onBlur={() => go(draftFrom, draftTo)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                go(draftFrom, draftTo);
              }
            }}
            className="h-9 w-44 rounded-control border border-border bg-surface px-2 font-mono text-sm disabled:opacity-50"
          />
        </div>
        {pending && <span className="pb-2 text-2xs text-text-muted">Updating…</span>}
      </div>

      <p className="text-2xs text-text-muted">
        {prettyDate(from)} to {prettyDate(to)}
        {span > 0 && ` · ${span} ${span === 1 ? "day" : "days"}`}
        {maxDays ? ` · up to ${maxDays} days at a time` : ""}
      </p>
      {note && <p className="text-2xs text-status-danger-fg">{note}</p>}
    </div>
  );
}
