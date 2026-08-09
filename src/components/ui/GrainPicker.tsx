"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Grain } from "@/features/dashboard/queries";
import { spanDays } from "@/lib/grain";

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
  params = {},
}: {
  basePath: string;
  grain: Grain;
  from: string;
  to: string;
  /** Passed in rather than read with useSearchParams.
   *
   *  useSearchParams forces the nearest Suspense boundary and bails the
   *  subtree out to client rendering when there is not one — and the
   *  page already knows its own parameters, so reading them back out of
   *  the URL was work to create a problem rather than solve one. */
  params?: Record<string, string>;
}) {
  const router = useRouter();
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
            const qs = new URLSearchParams();
            for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
            qs.set("from", from);
            qs.set("to", to);
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


