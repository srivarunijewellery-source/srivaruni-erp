import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ROUTES } from "@/config/nav";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { CostBreakdown } from "./queries";

/**
 * The arithmetic behind landed cost, shown as a running total.
 *
 * Everything is per unit, including the discount and freight shares --
 * those are stored per line, so they are divided by quantity here. A
 * breakdown that mixes line totals with unit costs is worse than no
 * breakdown, because the numbers look like they should add up and don't.
 */
export function CostBreakdownCard({ breakdown }: { breakdown: CostBreakdown }) {
  const qty = Math.max(1, breakdown.qty);
  const discountPerUnit = breakdown.discountPaise / qty;
  const additionalPerUnit = breakdown.additionalPaise / qty;
  const taxPerUnit = breakdown.taxPaise / qty;

  const rows: Array<{ label: string; value: number; note?: string; sign?: "minus" }> = [
    { label: "Vendor rate", value: breakdown.ratePaise },
  ];
  if (breakdown.discountPaise > 0) {
    rows.push({
      label: "Bill discount",
      value: -discountPerUnit,
      note: `${formatPaise(breakdown.discountPaise)} across ${qty}`,
      sign: "minus",
    });
  }
  if (breakdown.taxPaise > 0) {
    rows.push({
      label: "GST",
      value: breakdown.itcEligible ? 0 : taxPerUnit,
      note: breakdown.itcEligible
        ? `${formatPaise(taxPerUnit)} reclaimable, so not a cost`
        : "not reclaimable, so it is a cost",
    });
  }
  if (breakdown.additionalPaise > 0) {
    rows.push({
      label: "Freight and charges",
      value: additionalPerUnit,
      note: `${formatPaise(breakdown.additionalPaise)} across ${qty}`,
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">How this cost was built</span>
        <Link
          href={ROUTES.inwardDetail(breakdown.inwardId)}
          className="font-mono text-2xs text-text-muted underline-offset-2 hover:underline"
        >
          {breakdown.docNo}
        </Link>
      </CardHeader>
      <CardBody className="space-y-1.5">
        <p className="text-2xs text-text-muted">
          Per piece, from {breakdown.vendorName}. Quantity on that document was {qty}.
        </p>

        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.label} className="flex items-baseline justify-between gap-3 py-1.5">
              <div className="min-w-0">
                <span className="text-sm">{r.label}</span>
                {r.note && <p className="text-2xs text-text-subtle">{r.note}</p>}
              </div>
              <span
                className={cn(
                  "tnum shrink-0 font-mono text-sm",
                  r.sign === "minus" && "text-status-done-fg",
                )}
              >
                {r.sign === "minus" ? "−" : ""}
                {formatPaise(Math.abs(r.value))}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex items-baseline justify-between gap-3 border-t-2 border-text pt-2">
          <span className="font-medium">Landed cost</span>
          <span className="tnum font-mono font-semibold">
            {formatPaise(breakdown.landedUnitCostPaise)}
          </span>
        </div>
      </CardBody>
    </Card>
  );
}
