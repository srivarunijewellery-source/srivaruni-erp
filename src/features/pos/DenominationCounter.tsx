"use client";

import { useMemo } from "react";
import { formatPaise } from "@/lib/money";

/** Rupee values, largest first. ₹2000 is barely seen now but is still
 *  legal tender, and a counter with no row for it has nowhere to put one. */
const NOTES = [2000, 500, 200, 100, 50, 20, 10] as const;
const COINS = [20, 10, 5, 2, 1] as const;

export type Denominations = Record<string, number>;

export function denominationTotalPaise(d: Denominations): number {
  let paise = 0;
  for (const [rupees, count] of Object.entries(d)) {
    paise += Number(rupees) * 100 * (Number(count) || 0);
  }
  return paise;
}

/**
 * Counts the drawer one denomination at a time.
 *
 * A single "cash counted" box asked someone holding a fistful of notes
 * to do the arithmetic in their head, and a wrong total there becomes a
 * variance nobody can explain the next morning. Counting by
 * denomination is how the cash is physically sorted anyway, the total
 * falls out of it, and the breakdown is stored so a short drawer can be
 * traced to which pile was miscounted.
 */
export function DenominationCounter({
  value,
  onChange,
  autoFocus,
}: {
  value: Denominations;
  onChange: (next: Denominations) => void;
  autoFocus?: boolean;
}) {
  const total = useMemo(() => denominationTotalPaise(value), [value]);

  function set(rupees: number, raw: string) {
    const count = Math.max(0, Math.floor(Number(raw) || 0));
    const next = { ...value };
    if (count === 0) delete next[String(rupees)];
    else next[String(rupees)] = count;
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <Column
          title="Notes"
          values={NOTES}
          value={value}
          onSet={set}
          autoFocus={autoFocus}
        />
        <Column title="Coins" values={COINS} value={value} onSet={set} />
      </div>

      <div className="flex items-center justify-between rounded-control bg-surface-sunken px-3 py-2">
        <span className="text-sm font-medium">Counted</span>
        <span className="tnum font-mono text-lg">{formatPaise(total)}</span>
      </div>
    </div>
  );
}

function Column({
  title,
  values,
  value,
  onSet,
  autoFocus,
}: {
  title: string;
  values: readonly number[];
  value: Denominations;
  onSet: (rupees: number, raw: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-text-muted">
        {title}
      </p>
      <ul className="space-y-1">
        {values.map((r, i) => {
          const count = value[String(r)] ?? 0;
          return (
            <li key={r} className="flex items-center gap-2">
              <span className="tnum w-14 shrink-0 text-right font-mono text-sm">
                ₹{r}
              </span>
              <span aria-hidden className="text-text-subtle">
                ×
              </span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                aria-label={`${title} of ${r} rupees`}
                autoFocus={autoFocus && i === 0}
                value={count === 0 ? "" : count}
                onChange={(e) => onSet(r, e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder="0"
                className="h-9 w-20 rounded-control border border-border bg-surface px-2 text-right font-mono text-sm tabular-nums focus:border-brand focus:shadow-[var(--control-ring)] focus:outline-none"
              />
              <span className="tnum ml-auto font-mono text-2xs text-text-muted">
                {count > 0 ? formatPaise(r * 100 * count) : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
