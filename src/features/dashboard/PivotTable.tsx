import { formatPaise } from "@/lib/money";
import type { Pivot } from "./queries";

/**
 * Rows are the dimension, columns are months, plus a total and a share.
 *
 * Share of the grand total rather than a month-on-month percentage: with
 * a handful of months in view, MoM on a small category swings wildly and
 * reads as noise, while share answers the question actually being asked
 * — where is the money coming from.
 */
export function PivotTable({
  pivot,
  label,
  showMargin = false,
  limit = 20,
}: {
  pivot: Pivot;
  label: string;
  showMargin?: boolean;
  limit?: number;
}) {
  if (pivot.rows.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-text-muted">
        Nothing to show for this window.
      </p>
    );
  }

  const rows = pivot.rows.slice(0, limit);
  const hidden = pivot.rows.length - rows.length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-sunken">
            <th className="px-3 py-2 text-left text-2xs font-medium uppercase tracking-wide text-text-muted">
              {label}
            </th>
            {pivot.months.map((m) => (
              <th
                key={m}
                className="px-3 py-2 text-right text-2xs font-medium uppercase tracking-wide text-text-muted"
              >
                {m}
              </th>
            ))}
            <th className="px-3 py-2 text-right text-2xs font-medium uppercase tracking-wide text-text-muted">
              Total
            </th>
            {showMargin && (
              <th className="px-3 py-2 text-right text-2xs font-medium uppercase tracking-wide text-text-muted">
                Margin
              </th>
            )}
            <th className="px-3 py-2 text-right text-2xs font-medium uppercase tracking-wide text-text-muted">
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const share =
              pivot.grandTotalPaise > 0
                ? (r.totalRevenuePaise / pivot.grandTotalPaise) * 100
                : 0;
            return (
              <tr key={r.dimension} className="border-b border-border">
                <td className="px-3 py-2 font-medium">{r.dimension}</td>
                {pivot.months.map((m) => (
                  <td key={m} className="tnum px-3 py-2 text-right font-mono text-2xs">
                    {r.months[m] ? formatPaise(r.months[m]!.revenuePaise) : "—"}
                  </td>
                ))}
                <td className="tnum px-3 py-2 text-right font-mono font-medium">
                  {formatPaise(r.totalRevenuePaise)}
                </td>
                {showMargin && (
                  <td className="tnum px-3 py-2 text-right font-mono text-status-done-fg">
                    {formatPaise(r.totalMarginPaise)}
                  </td>
                )}
                <td className="tnum px-3 py-2 text-right font-mono text-2xs text-text-muted">
                  {share.toFixed(1)}%
                </td>
              </tr>
            );
          })}

          <tr className="bg-surface-sunken">
            <td className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-text-muted">
              Total
            </td>
            {pivot.months.map((m) => (
              <td key={m} className="tnum px-3 py-2 text-right font-mono text-2xs">
                {formatPaise(pivot.totals[m] ?? 0)}
              </td>
            ))}
            <td className="tnum px-3 py-2 text-right font-mono font-medium">
              {formatPaise(pivot.grandTotalPaise)}
            </td>
            {showMargin && <td />}
            <td />
          </tr>
        </tbody>
      </table>

      {hidden > 0 && (
        <p className="px-3 py-2 text-2xs text-text-subtle">
          {hidden} smaller {hidden === 1 ? "row is" : "rows are"} not shown.
        </p>
      )}
    </div>
  );
}
