import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { getInward } from "@/features/inward/queries";
import { can } from "@/config/roles";
import { INWARD_STATUS } from "@/config/status";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Barcode } from "@/components/ui/Barcode";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { InwardWorkflow } from "@/features/inward/InwardWorkflow";
import { formatDateTime, pluralise } from "@/lib/format";
import type { InwardLine } from "@/types/domain";

export default async function InwardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const inward = await getInward(id);
  if (!inward) notFound();

  const columns: ReadonlyArray<Column<InwardLine>> = [
    { key: "tag", header: "Tag", render: (l) => <Barcode code={l.barcode} /> },
    { key: "name", header: "Item", render: (l) => l.name },
    { key: "category", header: "Category", render: (l) => l.category },
    { key: "qty", header: "Received", numeric: true, render: (l) => l.qty },
    {
      key: "short",
      header: "Short",
      numeric: true,
      render: (l) =>
        l.qtyShort > 0 ? (
          <span className="text-status-danger-fg">{l.qtyShort}</span>
        ) : (
          "—"
        ),
    },
  ];

  const totalQty = inward.lines.reduce((s, l) => s + l.qty, 0);

  return (
    <>
      <PageHeader
        title={inward.docNo}
        description={`${inward.vendorName} · ${inward.locationCode} · ${inward.lines.length} ${pluralise(inward.lines.length, "line")}, ${totalQty} ${pluralise(totalQty, "piece")}`}
        action={
          <Badge tone={INWARD_STATUS[inward.status].tone}>
            {INWARD_STATUS[inward.status].label}
          </Badge>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DataTable columns={columns} rows={inward.lines} getKey={(l) => l.id} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <h2 className="font-medium">Document</h2>
            </CardHeader>
            <CardBody className="space-y-2 text-sm">
              <Row label="Vendor bill" value={inward.vendorInvoiceNo ?? "—"} />
              <Row label="Created" value={formatDateTime(inward.createdAt)} />
              <Row label="Submitted" value={formatDateTime(inward.submittedAt)} />
              <Row label="Approved" value={formatDateTime(inward.approvedAt)} />
              {inward.rejectedReason && (
                <p className="rounded-control bg-status-danger-bg p-2 text-status-danger-fg">
                  Sent back: {inward.rejectedReason}
                </p>
              )}
            </CardBody>
          </Card>

          <InwardWorkflow
            inwardId={inward.id}
            status={inward.status}
            canApprove={can(user.role, "inward.approve")}
          />
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-text-muted">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
