import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";
import { listTaxRates } from "@/features/accounting/queries";

export const metadata: Metadata = { title: "Tax rates" };

export default async function TaxPage() {
  const user = await requireUser();
  if (!can(user.role, "accounts.manage")) {
    return <EmptyState title="Tax settings are owner-only" />;
  }

  const rates = await listTaxRates();

  return (
    <>
      <PageHeader
        title="Tax rates"
        description="GST rates available to pricing, billing and expenses."
      />
      <Card>
        <CardBody className="p-0">
          <ul className="divide-y divide-border">
            {rates.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    {r.isDefault && <Badge tone="done">Default</Badge>}
                    {!r.active && <Badge tone="danger">Inactive</Badge>}
                  </div>
                  <p className="mt-0.5 text-2xs text-text-muted">
                    {[
                      r.hsnCode ? `HSN ${r.hsnCode}` : null,
                      `from ${formatDate(r.effectiveFrom)}`,
                      r.note,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm">{(r.totalBps / 100).toFixed(2)}%</p>
                  <p className="text-2xs text-text-muted">
                    {(r.totalBps / 200).toFixed(2)}% CGST + {(r.totalBps / 200).toFixed(2)}% SGST
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
      <p className="mt-3 px-1 text-2xs text-text-muted">
        Rates are effective-dated. Changing one adds a new rate rather than editing the
        old, so documents already issued keep the rate they were taxed at.
      </p>
    </>
  );
}
