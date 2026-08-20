import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { ROUTES } from "@/config/nav";
import { getAudit } from "@/features/audit/queries";
import { AuditCounter } from "@/features/audit/AuditCounter";

export const metadata: Metadata = { title: "Stock audit" };

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const audit = await getAudit(id);
  if (!audit) notFound();

  const scope = audit.scope as { categories?: string[]; styles?: string[] };
  const covers = [
    ...(scope.categories ?? []),
    ...(scope.styles ?? []),
  ].join(", ");

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Stock", href: ROUTES.stock },
          { label: "Audits", href: ROUTES.audits },
          { label: audit.docNo },
        ]}
        title={audit.docNo}
        description={
          covers
            ? `${audit.locationCode} · ${covers}`
            : `${audit.locationCode} · whole branch`
        }
        action={
          <Badge
            tone={
              audit.status === "approved"
                ? "done"
                : audit.status === "submitted"
                  ? "pending"
                  : "neutral"
            }
          >
            {audit.status}
          </Badge>
        }
      />

      <AuditCounter audit={audit} canApprove={can(user, "adjustment.approve")} />
    </>
  );
}
