"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { isoOf, isValidIsoDate } from "@/lib/dates";

/**
 * The window everything on the page is measured over.
 *
 * Presets first and prominent, because a date pair is a fiddly way to
 * say "yesterday" and it is what people want nine times out of ten. The
 * exact dates are behind a toggle for the tenth.
 *
 * The chosen range is ALWAYS restated in words underneath. A native date
 * input renders in the browser's own locale — on a machine set to US
 * English it shows 08/07/2026 for the 7th of August, and no amount of
 * CSS changes that. Writing "07 Aug 2026" beneath it removes the
 * ambiguity without fighting the platform.
 */
export function DateRangeBar({
  basePath,
  params,
  from,
  to,
}: {
  basePath: string;
  params: Record<string, string>;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [custom, setCustom] = useState(false);

  // Store time. `d.toISOString().slice(0,10)` converts to UTC first, so
  // "This month" resolved to the last day of the PREVIOUS month on every
  // one of these presets, and "Today" was yesterday for the owner in US
  // Pacific for most of the working day.
  const iso = (d: Date) => isoOf(d);

  function go(nextFrom: string, nextTo: string) {
    const merged = { ...params, from: nextFrom, to: nextTo, page: "" };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
    start(() => router.push(`${basePath}?${qs.toString()}`));
  }

  /** Presets described by what they produce, so the active one can be
   *  detected by comparing rather than remembered in state. */
  const presets: Array<[string, () => [string, string]]> = [
    ["Today", () => { const d = new Date(); return [iso(d), iso(d)]; }],
    ["Yesterday", () => {
      const d = new Date(); d.setDate(d.getDate() - 1);
      return [iso(d), iso(d)];
    }],
    ["7 days", () => {
      const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 6);
      return [iso(s), iso(e)];
    }],
    ["30 days", () => {
      const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 29);
      return [iso(s), iso(e)];
    }],
    ["This month", () => {
      const n = new Date();
      return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(n)];
    }],
    ["Last month", () => {
      const n = new Date();
      return [
        iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)),
        iso(new Date(n.getFullYear(), n.getMonth(), 0)),
      ];
    }],
    ["This year", () => {
      const n = new Date();
      return [iso(new Date(n.getFullYear(), 0, 1)), iso(n)];
    }],
    ["12 months", () => {
      const e = new Date(); const s = new Date();
      s.setMonth(s.getMonth() - 12);
      return [iso(s), iso(e)];
    }],
  ];

  const pretty = (d: string) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${day} ${months[Number(m) - 1] ?? ""} ${y}`;
  };

  const days =
    from && to
      ? Math.round(
          (new Date(to).getTime() - new Date(from).getTime()) / 86400000,
        ) + 1
      : 0;

  return (
    <Card className="mb-4">
      <CardBody className="space-y-2.5">
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
          <button
            type="button"
            onClick={() => setCustom((c) => !c)}
            className={`rounded-full px-3 py-1.5 text-2xs transition-colors ${
              custom
                ? "bg-surface-sunken"
                : "border border-border hover:border-brand hover:text-brand"
            }`}
          >
            {custom ? "Hide dates" : "Pick dates"}
          </button>
        </div>

        {custom && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
            {/* Uncontrolled, committing on blur. Controlled + onChange
                fired a navigation per edited segment; a no-op onChange
                would have frozen the field instead. `key` resets it when
                the server settles on a different range. */}
            <input
              key={`from-${from}`}
              type="date"
              defaultValue={from}
              max={to || undefined}
              disabled={pending}
              onBlur={(e) => {
                if (isValidIsoDate(e.target.value) && e.target.value !== from) {
                  go(e.target.value, to);
                }
              }}
              className="h-9 rounded-control border border-border bg-surface px-2 font-mono text-sm"
            />
            <span className="text-2xs text-text-muted">to</span>
            <input
              key={`to-${to}`}
              type="date"
              defaultValue={to}
              min={from || undefined}
              disabled={pending}
              onBlur={(e) => {
                if (isValidIsoDate(e.target.value) && e.target.value !== to) {
                  go(from, e.target.value);
                }
              }}
              className="h-9 rounded-control border border-border bg-surface px-2 font-mono text-sm"
            />
          </div>
        )}

        <p className="flex flex-wrap items-center gap-2 text-2xs text-text-muted">
          <span className="font-medium text-text">
            {pretty(from)} &ndash; {pretty(to)}
          </span>
          <span>
            {days} day{days === 1 ? "" : "s"}
          </span>
          {pending && (
            <span className="flex items-center gap-1.5 text-brand">
              <span className="size-2 animate-pulse rounded-full bg-brand" />
              updating
            </span>
          )}
        </p>
      </CardBody>
    </Card>
  );
}
