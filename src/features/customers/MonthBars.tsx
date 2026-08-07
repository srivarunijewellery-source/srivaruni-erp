"use client";

import Link from "next/link";
import { formatPaise } from "@/lib/money";
import type { MonthPoint } from "./queries";

/**
 * Revenue per month, and clicking a bar filters the list to that month.
 *
 * A chart you cannot act on is decoration. The question anyone actually
 * has looking at a dip is "who bought that month" — so the bar is a link
 * that answers it rather than a picture of the problem.
 */
export function MonthBars({
  months,
  basePath,
  activeFrom,
  params,
}: {
  months: MonthPoint[];
  basePath: string;
  /** Which month is currently filtering the list, if any. */
  activeFrom: string;
  params: Record<string, string>;
}) {
  if (months.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-text-muted">
        Nothing sold in this period.
      </p>
    );
  }

  const peak = Math.max(1, ...months.map((m) => m.revenuePaise));

  const href = (m: MonthPoint | null) => {
    const p = new URLSearchParams(params);
    p.delete("page");
    if (m && m.from !== activeFrom) {
      p.set("from", m.from);
      p.set("to", m.to);
    } else {
      p.delete("from");
      p.delete("to");
    }
    const qs = p.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div>
      <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
        {months.map((m) => {
          const active = m.from === activeFrom;
          return (
            <Link
              key={m.key}
              href={href(m)}
              scroll={false}
              title={`${m.month}: ${formatPaise(m.revenuePaise)} from ${m.customers} customers across ${m.bills} bills`}
              className="group flex min-w-12 flex-1 flex-col items-center gap-1"
            >
              <span
                className={`tnum text-2xs ${active ? "font-medium text-brand" : "text-text-muted"}`}
              >
                {m.customers}
              </span>
              <span
                className={`w-full rounded-t-sm transition-colors ${
                  active ? "bg-brand" : "bg-brand/70 group-hover:bg-brand"
                }`}
                style={{
                  height: `${Math.max(4, (m.revenuePaise / peak) * 88)}px`,
                }}
              />
              <span
                className={`text-2xs ${active ? "font-medium text-brand" : "text-text-subtle"}`}
              >
                {m.month}
              </span>
            </Link>
          );
        })}
      </div>

      <p className="mt-1 text-2xs text-text-muted">
        {activeFrom ? (
          <>
            Showing that month only.{" "}
            <Link href={href(null)} scroll={false} className="text-brand hover:underline">
              Show everything
            </Link>
          </>
        ) : (
          "Bars are revenue; the number above each is how many different people bought. Tap one to see who."
        )}
      </p>
    </div>
  );
}
