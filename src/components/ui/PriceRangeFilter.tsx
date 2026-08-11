"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/Field";
import { formatPaise } from "@/lib/money";

/**
 * Selling price range.
 *
 * Two sliders plus two boxes rather than one or the other: dragging is
 * how you explore a range you have not decided on yet, typing is how you
 * apply one you already know ("show me everything over two thousand").
 * Either drives the same value.
 *
 * Committed on release, not on drag. A slider that navigates on every
 * pixel fires dozens of queries across a six thousand item catalog and
 * the page fights the thumb.
 */
export function PriceRangeFilter({
  basePath,
  params,
  minPaise,
  maxPaise,
  floorPaise,
  ceilingPaise,
}: {
  basePath: string;
  /** Everything else currently filtering, so this does not drop it. */
  params: Record<string, string>;
  minPaise: number | null;
  maxPaise: number | null;
  /** The real extremes of the catalog, so the track spans what exists. */
  floorPaise: number;
  ceilingPaise: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [lo, setLo] = useState(minPaise ?? floorPaise);
  const [hi, setHi] = useState(maxPaise ?? ceilingPaise);

  // Follow the server when it settles on something different — a cleared
  // filter or a shared link.
  useEffect(() => {
    setLo(minPaise ?? floorPaise);
    setHi(maxPaise ?? ceilingPaise);
  }, [minPaise, maxPaise, floorPaise, ceilingPaise]);

  const active = minPaise !== null || maxPaise !== null;

  function apply(nextLo: number, nextHi: number) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v && k !== "page" && k !== "minPrice" && k !== "maxPrice") qs.set(k, v);
    }
    // Only sent when they actually narrow anything: a range equal to the
    // full span is not a filter, and leaving it in the URL makes every
    // link look filtered.
    if (nextLo > floorPaise) qs.set("minPrice", String(Math.round(nextLo / 100)));
    if (nextHi < ceilingPaise) qs.set("maxPrice", String(Math.round(nextHi / 100)));
    start(() => router.push(`${basePath}?${qs.toString()}`, { scroll: false }));
  }

  return (
    <div className="min-w-56">
      <Label htmlFor="price-lo">Selling price</Label>
      <div className="flex items-center gap-2">
        <input
          id="price-lo"
          type="number"
          min={0}
          value={Math.round(lo / 100)}
          onChange={(e) => setLo(Math.max(0, Number(e.target.value) * 100))}
          onBlur={() => apply(Math.min(lo, hi), hi)}
          className="h-[var(--control-height)] w-20 rounded-control border border-border bg-surface px-2 text-right font-mono text-2xs"
          aria-label="Lowest price"
        />
        <span className="text-2xs text-text-subtle">to</span>
        <input
          type="number"
          min={0}
          value={Math.round(hi / 100)}
          onChange={(e) => setHi(Math.max(0, Number(e.target.value) * 100))}
          onBlur={() => apply(lo, Math.max(hi, lo))}
          className="h-[var(--control-height)] w-20 rounded-control border border-border bg-surface px-2 text-right font-mono text-2xs"
          aria-label="Highest price"
        />
        {active && (
          <button
            type="button"
            onClick={() => apply(floorPaise, ceilingPaise)}
            className="text-2xs text-brand hover:underline"
          >
            clear
          </button>
        )}
      </div>

      {/* Two overlaid tracks. The lower thumb sits above so it stays
          grabbable when both are pushed to the same end. */}
      <div className="relative mt-2 h-5">
        <div className="absolute top-2 h-1 w-full rounded bg-surface-sunken" />
        <div
          className="absolute top-2 h-1 rounded bg-brand"
          style={{
            left: `${(lo / ceilingPaise) * 100}%`,
            right: `${100 - (hi / ceilingPaise) * 100}%`,
          }}
        />
        <input
          type="range"
          min={floorPaise}
          max={ceilingPaise}
          step={10000}
          value={lo}
          disabled={pending}
          onChange={(e) => setLo(Math.min(Number(e.target.value), hi))}
          onMouseUp={() => apply(lo, hi)}
          onTouchEnd={() => apply(lo, hi)}
          aria-label="Lowest price slider"
          className="pointer-events-none absolute inset-0 z-10 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand"
        />
        <input
          type="range"
          min={floorPaise}
          max={ceilingPaise}
          step={10000}
          value={hi}
          disabled={pending}
          onChange={(e) => setHi(Math.max(Number(e.target.value), lo))}
          onMouseUp={() => apply(lo, hi)}
          onTouchEnd={() => apply(lo, hi)}
          aria-label="Highest price slider"
          className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand"
        />
      </div>

      <p className="mt-0.5 text-2xs text-text-muted">
        {formatPaise(lo)} – {formatPaise(hi)}
        {pending ? " · updating…" : ""}
      </p>
    </div>
  );
}
