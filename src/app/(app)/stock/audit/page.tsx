import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ROUTES } from "@/config/nav";
import { formatDateTime } from "@/lib/format";
import { listAudits } from "@/features/audit/queries";
import { NewAuditForm } from "@/features/audit/NewAuditForm";
import { listStores } from "@/features/inward/queries";
import { getStockFacets } from "@/features/stock/queries";

export const metadata: Metadata = { title: "Stock audit" };

export default async function StockAuditPage() {
  const user = await requireUser();
  if (!can(user, "transfer.approve")) {
    return <EmptyState title="Stock audits are for managers and the owner" />;
  }

  const [audits, stores, facets] = await Promise.all([
    listAudits(),
    listStores(),
    getStockFacets(),
  ]);

  return (
    <>
      <PageHeader
        title="Stock audit"
        description="Pick a shelf, generate a slip, scan every tag on it. The count is what the shelf says; the variance posts once you approve."
        action={
          <NewAuditForm
            stores={stores}
            categories={facets.categories}
            styles={facets.styles}
            defaultLocationId={user.locationId ?? stores[0]?.id ?? ""}
          />
        }
      />

      {audits.length === 0 ? (
        <EmptyState title="No counts yet" />
      ) : (
        <ul className="space-y-2">
          {audits.map((a) => (
            <li key={a.id}>
              <Link href={ROUTES.auditDetail(a.id)}>
                <Card className="transition hover:border-border-strong">
                  <CardBody className="flex flex-wrap items-center gap-3">
                    <span className="min-w-40 flex-1">
                      <span className="block font-mono text-sm font-medium">
                        {a.docNo}{" "}
                        <span className="text-text-subtle">{a.locationCode}</span>
                      </span>
                      <span className="block text-2xs text-text-muted">
                        {a.note ? `${a.note} · ` : ""}
                        {formatDateTime(a.createdAt)} · {a.createdBy}
                      </span>
                    </span>
                    <span className="tnum text-2xs text-text-muted">
                      {a.counted}/{a.lines} counted
                    </span>
                    {a.variances > 0 && (
                      <span className="tnum text-2xs text-status-danger-fg">
                        {a.variances} off
                      </span>
                    )}
                    <Badge
                      tone={
                        a.status === "approved"
                          ? "done"
                          : a.status === "submitted"
                            ? "pending"
                            : "neutral"
                      }
                    >
                      {a.status}
                    </Badge>
                  </CardBody>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
