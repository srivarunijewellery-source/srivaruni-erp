import { cn } from "@/lib/cn";

/**
 * Presentational table. Deliberately dumb: no sorting, no fetching, no
 * state. Pages compose it with data they already have, which keeps
 * server components server-side.
 */
export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  /** Right-align and use tabular figures. For money and quantities. */
  numeric?: boolean;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getKey,
}: {
  columns: ReadonlyArray<Column<T>>;
  rows: readonly T[];
  getKey: (row: T) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-sunken">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "px-2 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-text-muted",
                  c.numeric && "text-right",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getKey(row)} className="border-b border-border last:border-0">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "px-2 py-1.5 align-middle",
                    c.numeric && "tnum text-right",
                    c.className,
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
