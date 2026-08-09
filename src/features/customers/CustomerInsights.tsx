"use client";

import { formatPaise } from "@/lib/money";
import type { SpendPoint, VisitCohort } from "./queries";

/**
 * Who came, and how often they have come before.
 *
 * Drawn as plain SVG for the same reason as the sales trend: one chart
 * shape, and a charting library would bring its own colour and font
 * system to argue with the design tokens.
 */
export function VisitCohorts({ cohorts }: { cohorts: VisitCohort[] }) {
  const total = cohorts.reduce((s, c) => s + c.customers, 0);
  if (total === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-text-muted">
        Nobody with a customer record bought in this period.
      </p>
    );
  }

  const peak = Math.max(...cohorts.map((c) => c.customers), 1);
  const returning = cohorts
    .filter((c) => c.visitNo > 1)
    .reduce((s, c) => s + c.customers, 0);

  return (
    <div className="space-y-3 p-3">
      <div className="flex flex-wrap gap-6">
        <Fig label="Customers" value={String(total)} />
        <Fig
          label="Returning"
          value={`${returning} · ${((returning / total) * 100).toFixed(0)}%`}
        />
        <Fig
          label="First time"
          value={`${total - returning} · ${(((total - returning) / total) * 100).toFixed(0)}%`}
        />
      </div>

      <ul className="space-y-1.5">
        {cohorts.map((c) => (
          <li key={c.visitNo} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3">
            <span className="text-2xs text-text-muted">{c.label}</span>
            {/* A bar rather than a number alone: the shape of the drop
                from first to fifth is the whole point. */}
            <span className="h-4 rounded-sm bg-surface-sunken">
              <span
                className="block h-4 rounded-sm bg-brand"
                style={{ width: `${Math.max((c.customers / peak) * 100, 2)}%` }}
              />
            </span>
            <span className="tnum text-2xs">
              {c.customers}
              <span className="ml-2 text-text-subtle">
                {formatPaise(c.revenuePaise)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Average bill through the period, one bar per bucket. */
export function SpendTrend({ points }: { points: SpendPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-text-muted">
        Nothing sold in this window.
      </p>
    );
  }

  const W = 760;
  const H = 200;
  const padL = 8, padR = 8, padT = 16, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const peak = Math.max(...points.map((p) => p.avgBillPaise), 1);
  const slot = innerW / points.length;
  const barW = Math.min(slot * 0.62, 48);
  const x = (i: number) => padL + slot * i + (slot - barW) / 2;
  const y = (v: number) => padT + innerH - (v / peak) * innerH;

  // Only every nth label when the buckets get dense, or they overlap into
  // an unreadable smear.
  const step = Math.ceil(points.length / 14);

  return (
    <div className="overflow-x-auto px-2 pb-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-52 w-full min-w-[540px]"
        role="img"
        aria-label="Average bill by period"
      >
        {points.map((p, i) => (
          <g key={p.bucket}>
            <rect
              x={x(i)}
              y={y(p.avgBillPaise)}
              width={barW}
              height={Math.max(padT + innerH - y(p.avgBillPaise), 1)}
              rx={2}
              fill="var(--color-brand)"
            />
            <title>{`${p.label}: ${formatPaise(p.avgBillPaise)} average across ${p.bills} bill${p.bills === 1 ? "" : "s"}`}</title>
            {i % step === 0 && (
              <text
                x={x(i) + barW / 2}
                y={H - 10}
                textAnchor="middle"
                fontSize="10"
                fill="var(--color-text-subtle)"
              >
                {p.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xs uppercase tracking-wide text-text-subtle">{label}</p>
      <p className="tnum text-lg font-semibold">{value}</p>
    </div>
  );
}
