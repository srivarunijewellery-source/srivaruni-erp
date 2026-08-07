"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { CustomerPeek } from "./CustomerPeek";
import type { CustomerListRow } from "./queries";

/**
 * The customer list, made readable.
 *
 * It used to be a name and a phone number on two tall lines, which at
 * 1,483 rows of near-identical SRIDEVIs told you nothing and scrolled
 * forever. Every row now carries what distinguishes one from another —
 * spend, bills, when they last came — on a single line, and clicking
 * opens the whole history without leaving the page.
 */
export function CustomerTable({ rows }: { rows: CustomerListRow[] }) {
  const [peek, setPeek] = useState<CustomerListRow | null>(null);

  if (rows.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-text-muted">
        Nobody matches that.
      </p>
    );
  }

  const today = new Date();
  const daysSince = (d: string | null) =>
    d ? Math.floor((today.getTime() - new Date(d).getTime()) / 86400000) : null;

  return (
    <>
      <ul className="divide-y divide-border">
        {rows.map((c) => {
          const gap = daysSince(c.lastVisit);
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setPeek(c)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-sunken"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {c.name ?? "Unnamed"}
                    {c.creditPaise > 0 && (
                      <span className="ml-2 text-2xs text-status-done-fg">
                        {formatPaise(c.creditPaise)} credit
                      </span>
                    )}
                    {c.coupons > 0 && (
                      <span className="ml-2 text-2xs text-text-muted">
                        {c.coupons} coupon{c.coupons === 1 ? "" : "s"}
                      </span>
                    )}
                  </span>
                  <span className="block font-mono text-2xs text-text-subtle">
                    {c.phone}
                    {c.city ? ` · ${c.city}` : ""}
                  </span>
                </span>

                <span className="hidden w-24 shrink-0 text-right text-2xs text-text-muted sm:block">
                  {c.bills === 0
                    ? "never bought"
                    : `${c.bills} bill${c.bills === 1 ? "" : "s"} · ${c.pieces} pcs`}
                </span>

                {/* Days since is the useful form: "112 days ago" prompts a
                    call in a way that a date does not. */}
                <span
                  className={`hidden w-28 shrink-0 text-right text-2xs sm:block ${
                    gap !== null && gap > 120 ? "text-status-pending-fg" : "text-text-muted"
                  }`}
                >
                  {c.lastVisit ? `${formatDate(c.lastVisit)}` : "—"}
                  {gap !== null && (
                    <span className="block text-text-subtle">{gap}d ago</span>
                  )}
                </span>

                <span className="tnum w-28 shrink-0 text-right font-mono text-sm">
                  {formatPaise(c.spentPaise)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {peek && (
        <CustomerPeek
          customerId={peek.id}
          name={peek.name ?? peek.phone}
          onClose={() => setPeek(null)}
        />
      )}
    </>
  );
}
