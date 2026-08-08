"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addDays, isValidIsoDate, prettyDate, todayIso } from "@/lib/dates";

/**
 * Day picker and branch filter, built for a phone first.
 *
 * This is checked standing in a shop or in a car, so the presets are
 * large tap targets on their own row and the exact dates stay collapsed
 * behind a toggle. Nobody types a date to mean "yesterday".
 *
 * Dates commit on blur, never on change: a native date input fires on
 * every segment edited, and binding that to a navigation is what made
 * the profit and loss page unusable.
 */
export function TodayFilters({
  from,
  to,
  locationId,
  branches,
}: {
  from: string;
  to: string;
  locationId: string;
  branches: Array<{ id: string; code: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [custom, setCustom] = useState(false);
  const today = todayIso();

  function go(next: { from?: string; to?: string; location?: string }) {
    const merged = { from, to, location: locationId, ...next };
    if (!isValidIsoDate(merged.from) || !isValidIsoDate(merged.to)) return;
    const qs = new URLSearchParams();
    qs.set("from", merged.from);
    qs.set("to", merged.to);
    if (merged.location) qs.set("location", merged.location);
    start(() => router.push(`/?${qs.toString()}`, { scroll: false }));
  }

  const presets: Array<[string, string, string]> = [
    ["Today", today, today],
    ["Yesterday", addDays(today, -1), addDays(today, -1)],
    ["7 days", addDays(today, -6), today],
    ["30 days", addDays(today, -29), today],
    ["This month", `${today.slice(0, 7)}-01`, today],
  ];

  return (
    <div className="space-y-2">
      {/* Scrolls sideways on a narrow screen rather than wrapping into
          three cramped rows. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {presets.map(([label, f, t]) => {
          const active = f === from && t === to;
          return (
            <button
              key={label}
              type="button"
              disabled={pending}
              onClick={() => go({ from: f, to: t })}
              className={`shrink-0 rounded-full px-4 py-2 text-sm transition-colors disabled:opacity-50 ${
                active
                  ? "bg-brand text-brand-fg"
                  : "border border-border bg-surface hover:border-brand"
              }`}
            >
              {label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCustom((c) => !c)}
          className="shrink-0 rounded-full border border-border bg-surface px-4 py-2 text-sm hover:border-brand"
        >
          {custom ? "Hide dates" : "Pick dates"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {branches.length > 1 && (
          <select
            value={locationId}
            disabled={pending}
            onChange={(e) => go({ location: e.target.value })}
            aria-label="Branch"
            className="h-11 flex-1 rounded-control border border-border bg-surface px-3 text-sm sm:h-9 sm:flex-none"
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {b.name}
              </option>
            ))}
          </select>
        )}
        <span className="text-2xs text-text-muted">
          {from === to ? prettyDate(from) : `${prettyDate(from)} → ${prettyDate(to)}`}
          {pending ? " · updating…" : ""}
        </span>
      </div>

      {custom && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-2">
          <input
            key={`f-${from}`}
            type="date"
            defaultValue={from}
            max={to}
            disabled={pending}
            aria-label="From"
            onBlur={(e) => e.target.value !== from && go({ from: e.target.value })}
            className="h-11 flex-1 rounded-control border border-border bg-surface px-2 font-mono text-sm sm:h-9 sm:flex-none"
          />
          <input
            key={`t-${to}`}
            type="date"
            defaultValue={to}
            min={from}
            disabled={pending}
            aria-label="To"
            onBlur={(e) => e.target.value !== to && go({ to: e.target.value })}
            className="h-11 flex-1 rounded-control border border-border bg-surface px-2 font-mono text-sm sm:h-9 sm:flex-none"
          />
        </div>
      )}
    </div>
  );
}
