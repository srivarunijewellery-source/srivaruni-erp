"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { Grain } from "@/features/dashboard/queries";

const ALL: Array<{ key: Grain; label: string }> = [
  { key: "day", label: "Daily" },
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
  { key: "year", label: "Yearly" },
];

/**
 * How wide each bar is.
 *
 * The right answer is usually implied by the range — seven days wants
 * seven bars, a year wants twelve — so `defaultGrain` below picks it and
 * this control is for overriding, not for making people choose every
 * time.
 *
 * Grains that would produce a useless chart are hidden rather than
 * disabled: monthly over a seven day range is one bar, and offering it
 * only invites the click that produces it.
 */
export function GrainPicker({
  basePath,
  grain,
  from,
  to,
}: {
  basePath: string;
  grain: Grain;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const days = spanDays(from, to);
  const usable = ALL.filter(({ key }) => {
    if (key === "day") return days <= 92;      // beyond a quarter it is a smear
    if (key === "week") return days >= 7;
    if (key === "month") return days >= 45;
    return days >= 300;
  });

  if (usable.length < 2) return null;

  return (
    <div className="flex gap-1.5">
      {usable.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          disabled={pending}
          onClick={() => {
            const qs = new URLSearchParams(params.toString());
            qs.set("grain", key);
            start(() => router.push(`${basePath}?${qs.toString()}`, { scroll: false }));
          }}
          className={`rounded-full px-3 py-1.5 text-2xs transition-colors disabled:opacity-50 ${
            grain === key
              ? "bg-brand text-brand-fg"
              : "border border-border hover:border-brand"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function spanDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.round((b - a) / 86400000) + 1;
}

/**
 * The grain a range implies, when nobody has chosen one.
 *
 * Roughly 7–30 bars is what a chart this size can carry: fewer and it is
 * a table with extra steps, more and the bars are too thin to compare.
 */
export function defaultGrain(from: string, to: string): Grain {
  const days = spanDays(from, to);
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  if (days <= 800) return "month";
  return "year";
}
