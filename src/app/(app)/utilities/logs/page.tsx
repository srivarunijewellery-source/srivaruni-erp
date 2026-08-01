import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { listAuditEntries, AUDITED_TABLES } from "@/features/logs/queries";
import { isOwner } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Activity log" };

const ACTION_TONE: Record<string, string> = {
  INSERT: "bg-status-done-bg text-status-done-fg",
  UPDATE: "bg-status-approved-bg text-status-approved-fg",
  DELETE: "bg-status-danger-bg text-status-danger-fg",
};

/** Column names are database identifiers; these are what a person calls them. */
const LABEL: Record<string, string> = {
  qty: "Quantity",
  status: "Status",
  rate_paise: "Rate",
  discount_bps: "Discount %",
  discount_paise: "Discount amount",
  amount_paise: "Amount",
  selling_price_paise: "Selling price",
  mrp_paise: "MRP",
  qty_requested: "Requested",
  qty_picked: "Picked",
  qty_sent: "Sent",
  qty_received: "Received",
};

function pretty(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  const s = String(v);
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; action?: string }>;
}) {
  const [user, { table = "", action = "" }] = await Promise.all([requireUser(), searchParams]);

  if (!isOwner(user.role)) {
    return (
      <>
        <PageHeader title="Activity log" />
        <EmptyState
          title="Owner only"
          hint="The activity log records who changed what across the system, so it is restricted to the owner at the database level."
        />
      </>
    );
  }

  const entries = await listAuditEntries({ table, action, limit: 150 });

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Utilities", href: ROUTES.barcodes }, { label: "Activity log" }]}
        title="Activity log"
        description="Every recorded change, newest first, with who made it."
      />

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3">
          <form className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="table" className="mb-1 block text-sm font-medium">
                Area
              </label>
              <select
                id="table"
                name="table"
                defaultValue={table}
                className="h-9 rounded-control border border-border bg-surface px-2 text-sm"
              >
                <option value="">Everything</option>
                {AUDITED_TABLES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="action" className="mb-1 block text-sm font-medium">
                Action
              </label>
              <select
                id="action"
                name="action"
                defaultValue={action}
                className="h-9 rounded-control border border-border bg-surface px-2 text-sm"
              >
                <option value="">Any</option>
                <option value="INSERT">Created</option>
                <option value="UPDATE">Changed</option>
                <option value="DELETE">Deleted</option>
              </select>
            </div>
            <Button type="submit" variant="secondary">
              Filter
            </Button>
            {(table || action) && (
              <Link href="/utilities/logs">
                <Button type="button" variant="ghost">
                  Clear
                </Button>
              </Link>
            )}
          </form>
        </CardBody>
      </Card>

      {entries.length === 0 ? (
        <EmptyState title="Nothing recorded yet" hint="Changes will appear here as they happen." />
      ) : (
        <Card>
          <CardBody className="py-0">
            <ul className="divide-y divide-border">
              {entries.map((e) => (
                <li key={e.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-2xs font-medium",
                        ACTION_TONE[e.action] ?? "bg-surface-sunken text-text-muted",
                      )}
                    >
                      {e.action === "INSERT" ? "Created" : e.action === "UPDATE" ? "Changed" : "Deleted"}
                    </span>
                    <span className="text-sm font-medium">{e.tableName.replace(/_/g, " ")}</span>
                    <span className="min-w-0 flex-1 truncate text-2xs text-text-muted">
                      {e.changedByName ?? "System"}
                      {e.changedByRole && ` · ${e.changedByRole}`}
                    </span>
                    <span className="tnum text-2xs text-text-muted">
                      {formatDateTime(e.changedAt)}
                    </span>
                  </div>

                  {e.changes && Object.keys(e.changes).length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {Object.entries(e.changes).map(([field, v]) => (
                        <li key={field} className="text-2xs text-text-muted">
                          <span className="font-medium text-text">
                            {LABEL[field] ?? field.replace(/_/g, " ")}
                          </span>{" "}
                          <span className="font-mono">{pretty(v.from)}</span>
                          {" → "}
                          <span className="font-mono text-text">{pretty(v.to)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </>
  );
}
