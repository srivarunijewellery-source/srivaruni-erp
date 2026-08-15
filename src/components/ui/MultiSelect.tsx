"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A dropdown that takes more than one answer.
 *
 * Single-select filters force a false choice: "show me Bangles" when the
 * question was "show me Bangles and Chowkers". People worked around it
 * by filtering twice and reading both lists, which is the sort of thing
 * that quietly stops anyone using filters at all.
 *
 * Built as a popover over checkboxes rather than a native multiple
 * select, because the native one needs ctrl-click to add a second value
 * and cannot be used on a phone at all.
 */
export function MultiSelect({
  id,
  label,
  allLabel,
  options,
  chosen,
  onChange,
  disabled,
  tone = "include",
}: {
  id: string;
  label: string;
  /** Shown when nothing is picked, e.g. "All categories". */
  allLabel: string;
  options: Array<{ value: string; label: string }>;
  chosen: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** Excluding reads as a warning, not a selection — amber, and the
   *  summary says so, or the two controls look identical while doing
   *  opposite things. */
  tone?: "include" | "exclude";
}) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState("");
  const box = useRef<HTMLDivElement>(null);

  // Close on an outside click. Without this, opening a second filter
  // leaves the first hanging open behind it.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const toggle = (v: string) =>
    onChange(chosen.includes(v) ? chosen.filter((x) => x !== v) : [...chosen, v]);

  const needle = find.trim().toLowerCase();
  const shown = needle
    ? options.filter((o) => o.label.toLowerCase().includes(needle))
    : options;

  // Names the first two and counts the rest: "Bangles, Chowkers +3" says
  // more at a glance than "5 selected".
  const summary =
    chosen.length === 0
      ? allLabel
      : (tone === "exclude" ? "not " : "") +
        chosen
          .slice(0, 2)
          .map((v) => options.find((o) => o.value === v)?.label ?? v)
          .join(", ") +
        (chosen.length > 2 ? ` +${chosen.length - 2}` : "");

  return (
    <div className="relative" ref={box}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-[var(--control-height)] w-full items-center justify-between gap-2 rounded-control border px-2 text-left text-sm disabled:opacity-50 ${
          chosen.length === 0
            ? "border-border bg-surface"
            : tone === "exclude"
              ? "border-status-pending-fg bg-status-pending-bg"
              : "border-brand bg-brand-subtle"
        }`}
      >
        <span className="truncate">{summary}</span>
        <span className="shrink-0 text-2xs text-text-subtle">
          {chosen.length > 0 ? chosen.length : "▾"}
        </span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-56 rounded-card border border-border bg-surface p-2 shadow-raised">
          {/* Search appears only when the list is long enough to need
              it — a search box above six options is clutter. */}
          {options.length > 8 && (
            <input
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder={`Find a ${label.toLowerCase()}`}
              className="mb-2 h-8 w-full rounded-control border border-border bg-surface px-2 text-2xs"
            />
          )}

          <div className="max-h-64 space-y-0.5 overflow-auto">
            {shown.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2 rounded-control px-2 py-1 text-2xs hover:bg-surface-sunken"
              >
                <input
                  type="checkbox"
                  checked={chosen.includes(o.value)}
                  onChange={() => toggle(o.value)}
                />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
            {shown.length === 0 && (
              <p className="px-2 py-3 text-center text-2xs text-text-muted">
                Nothing matches that.
              </p>
            )}
          </div>

          {chosen.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-2 w-full rounded-control border border-border py-1 text-2xs text-text-muted hover:border-brand"
            >
              Clear {chosen.length}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
