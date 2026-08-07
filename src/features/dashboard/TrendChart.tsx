"use client";

import { useState } from "react";
import { formatPaise } from "@/lib/money";
import type { PeriodPoint } from "./queries";

/**
 * Revenue bars with a margin line over them, drawn as plain SVG.
 *
 * Deliberately not a charting library. This is one chart shape on one
 * screen, and recharts would add a large dependency plus its own colour
 * and font system to fight with the design tokens. Inline SVG uses the
 * same CSS variables as everything else, so it stays consistent for
 * free and renders on the server with no client bundle at all.
 */
export function TrendChart({ points }: { points: PeriodPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-text-muted">
        Nothing sold in this window.
      </p>
    );
  }

  const W = 760;
  const H = 240;
  const padL = 8;
  const padR = 8;
  const padT = 16;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const peak = Math.max(...points.map((p) => p.revenuePaise), 1);
  const slot = innerW / points.length;
  const barW = Math.min(slot * 0.6, 54);

  const x = (i: number) => padL + slot * i + (slot - barW) / 2;
  const y = (v: number) => padT + innerH - (v / peak) * innerH;

  // The margin line rides the same scale as revenue, so the gap between
  // the two is readable as money rather than needing a second axis.
  const linePts = points
    .map((p, i) => `${x(i) + barW / 2},${y(p.marginPaise)}`)
    .join(" ");

  return (
    <div className="overflow-x-auto px-2 pb-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-60 w-full min-w-[540px]"
        role="img"
        aria-label="Revenue and margin by period"
      >
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={padL}
            x2={W - padR}
            y1={padT + innerH - innerH * f}
            y2={padT + innerH - innerH * f}
            stroke="var(--color-border)"
            strokeDasharray="3 3"
          />
        ))}

        {points.map((p, i) => (
          <g key={p.bucket}>
            {/* A full-height invisible strip, not just the bar: aiming at
                a 4px-tall bar for a thin month is not a thing anyone
                should have to do. */}
            <rect
              x={padL + slot * i}
              y={padT}
              width={slot}
              height={innerH}
              fill={hover === i ? "var(--color-surface-sunken)" : "transparent"}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "pointer" }}
            />
            <rect
              x={x(i)}
              y={y(p.revenuePaise)}
              width={barW}
              height={Math.max(1, padT + innerH - y(p.revenuePaise))}
              rx="3"
              fill="var(--color-brand)"
              opacity={hover === null || hover === i ? 0.9 : 0.4}
              pointerEvents="none"
            />
            <text
              x={x(i) + barW / 2}
              y={H - 9}
              textAnchor="middle"
              fontSize="10"
              fill={
                hover === i ? "var(--color-text)" : "var(--color-text-muted)"
              }
              pointerEvents="none"
            >
              {p.label}
            </text>
          </g>
        ))}

        <polyline
          points={linePts}
          fill="none"
          stroke="var(--color-status-done-fg)"
          strokeWidth="2"
        />
        {points.map((p, i) => (
          <circle
            key={`m-${p.bucket}`}
            cx={x(i) + barW / 2}
            cy={y(p.marginPaise)}
            r={hover === i ? 5 : 3}
            fill="var(--color-surface)"
            stroke="var(--color-status-done-fg)"
            strokeWidth="2"
            pointerEvents="none"
          />
        ))}
      </svg>

      {/* The readout sits under the chart rather than floating over it:
          a tooltip that covers the next bar is worse than no tooltip,
          and this one works on a touchscreen too. */}
      <div className="min-h-9 px-2 py-1">
        {hover !== null && points[hover] ? (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-2xs">
            <span className="font-medium">{points[hover]!.label}</span>
            <span>
              Revenue{" "}
              <span className="tnum font-mono text-text">
                {formatPaise(points[hover]!.revenuePaise)}
              </span>
            </span>
            <span>
              Margin{" "}
              <span className="tnum font-mono text-status-done-fg">
                {formatPaise(points[hover]!.marginPaise)}
              </span>
              {points[hover]!.revenuePaise > 0 && (
                <span className="text-text-muted">
                  {" "}
                  ({(
                    (points[hover]!.marginPaise / points[hover]!.revenuePaise) *
                    100
                  ).toFixed(1)}
                  %)
                </span>
              )}
            </span>
            <span className="text-text-muted">
              {points[hover]!.bills} bills · {points[hover]!.qty} pieces
            </span>
          </div>
        ) : (
          <span className="text-2xs text-text-subtle">
            Point at a bar for the detail.
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-4 px-2 text-2xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-brand" /> Revenue
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 bg-status-done-fg" /> Margin
        </span>
      </div>
    </div>
  );
}
