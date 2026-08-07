"use client";

import { useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { formatPaise } from "@/lib/money";
import { FinanceDrill } from "./FinanceDrill";
import type { FinanceSummary } from "./queries";

/**
 * The money, at a glance, with a way behind every number.
 *
 * Balances and flows are shown apart on purpose. Cash, bank and stock
 * are what you HAVE, as at the end of the window; sales, cost and
 * expenses are what MOVED during it. Putting them in one row invites the
 * reading that they add up, and they do not.
 */
export function SummaryCards({
  summary,
  from,
  to,
  location,
}: {
  summary: FinanceSummary;
  from: string;
  to: string;
  location: string | null;
}) {
  const [drill, setDrill] = useState<{ metric: string; title: string } | null>(null);

  const gross = summary.salesPaise - summary.cogsPaise;
  const net = gross - summary.expensesPaise;
  const grossPct = summary.salesPaise > 0 ? (gross / summary.salesPaise) * 100 : 0;

  return (
    <>
      <section className="mb-4">
        <h2 className="mb-2 text-2xs font-medium uppercase tracking-widest text-text-muted">
          What you have, right now
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Cash in hand" value={formatPaise(summary.cashPaise)} />
          <Stat
            label="Bank"
            value={formatPaise(summary.bankPaise)}
            tone={summary.bankPaise < 0 ? "warn" : undefined}
            hint={
              summary.bankPaise < 0
                ? "negative — deposits not recorded"
                : undefined
            }
          />
          <Stat
            label="Stock at cost"
            value={formatPaise(summary.inventoryPaise)}
            hint={`${summary.stockPieces} pieces`}
          />
          <Stat
            label="GST payable"
            value={formatPaise(summary.gstPayablePaise)}
            hint="collected, not yet paid"
          />
        </div>
      </section>

      <section className="mb-4">
        <h2 className="mb-2 text-2xs font-medium uppercase tracking-widest text-text-muted">
          What moved in this window
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Sales"
            value={formatPaise(summary.salesPaise)}
            hint={`${summary.bills} bills`}
            onClick={() => setDrill({ metric: "sales", title: "Sales, day by day" })}
          />
          <Stat
            label="Cost of goods"
            value={formatPaise(summary.cogsPaise)}
            onClick={() => setDrill({ metric: "cogs", title: "Cost of goods sold" })}
          />
          <Stat
            label="Gross profit"
            value={formatPaise(gross)}
            hint={`${grossPct.toFixed(1)}% of sales`}
          />
          <Stat
            label="Expenses"
            value={formatPaise(summary.expensesPaise)}
            onClick={() => setDrill({ metric: "expenses", title: "Expenses, day by day" })}
          />
        </div>
      </section>

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-2xs uppercase tracking-widest text-text-muted">
              Net profit
            </p>
            <p className="text-2xs text-text-subtle">
              sales less cost of goods less expenses
            </p>
          </div>
          <p
            className={`tnum font-mono text-4xl leading-none ${
              net < 0 ? "text-status-danger-fg" : ""
            }`}
          >
            {formatPaise(net)}
          </p>
        </CardBody>
      </Card>

      {(summary.returnsPaise > 0 || summary.customerCreditPaise > 0) && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Stat
            label="Returned"
            value={formatPaise(summary.returnsPaise)}
            onClick={() => setDrill({ metric: "returns", title: "Returns" })}
          />
          <Stat
            label="Credit customers hold"
            value={formatPaise(summary.customerCreditPaise)}
            hint="a liability until spent"
          />
        </div>
      )}

      {drill && (
        <FinanceDrill
          metric={drill.metric}
          title={drill.title}
          from={from}
          to={to}
          location={location}
          onClose={() => setDrill(null)}
        />
      )}
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warn";
  onClick?: () => void;
}) {
  const inner = (
    <CardBody>
      <p className="text-2xs uppercase tracking-wide text-text-muted">{label}</p>
      <p
        className={`tnum font-mono text-2xl ${
          tone === "warn" ? "text-status-pending-fg" : ""
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-2xs text-text-subtle">{hint}</p>}
      {onClick && (
        <p className="mt-0.5 text-2xs text-brand">day by day &rsaquo;</p>
      )}
    </CardBody>
  );

  if (!onClick) return <Card>{inner}</Card>;
  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card className="h-full transition-colors hover:border-brand">{inner}</Card>
    </button>
  );
}
