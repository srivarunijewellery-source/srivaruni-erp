import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { listInwards } from "@/features/inward/queries";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { INWARD_STATUS } from "@/config/status";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { formatDate } from "@/lib/format";
import type { InwardSummary } from "@/types/domain";

export const metadata: Metadata = { title: "Inward" };

export default async function InwardPage() {
  const user = await requireUser();
  const inwards = await listInwards();

  const columns: ReadonlyArray<Column<InwardSummary>> = [
    {
      key: "doc",
      header: "Document",
      render: (r) => (
        <Link href={ROUTES.inwardDetail(r.id)} className="font-mono hover:text-brand">
          {r.docNo}
        </Link>
      ),
    },
    { key: "vendor", header: "Vendor", render: (r) => r.vendorName },
    { key: "store", header: "Store", render: (r) => <span className="font-mono text-2xs">{r.locationCode}</span> },
    { key: "lines", header: "Lines", numeric: true, render: (r) => r.lineCount },
    { key: "qty", header: "Pieces", numeric: true, render: (r) => r.totalQty },
    { key: "date", header: "Created", render: (r) => formatDate(r.createdAt) },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge tone={INWARD_STATUS[r.status].tone}>{INWARD_STATUS[r.status].label}</Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Inward"
        description="Goods received. Nothing becomes sellable until it is priced and approved."
        action={
          can(user.role, "inward.create") && (
            <Link href={ROUTES.inwardNew}>
              <Button variant="primary">Record goods received</Button>
            </Link>
          )
        }
      />

      {inwards.length === 0 ? (
        <EmptyState
          title="No goods recorded yet"
          hint="When a carton arrives, record it here. Add the items, attach a photo of the vendor bill, and send it for pricing."
          action={
            <Link href={ROUTES.inwardNew}>
              <Button variant="primary">Record goods received</Button>
            </Link>
          }
        />
      ) : (
        <DataTable columns={columns} rows={inwards} getKey={(r) => r.id} />
      )}
    </>
  );
}
