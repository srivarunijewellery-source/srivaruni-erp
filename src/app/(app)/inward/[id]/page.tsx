import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import {
  getInward,
  listItemFormOptions,
  listInwardAttachments,
} from "@/features/inward/queries";
import { can } from "@/config/roles";
import { INWARD_STATUS } from "@/config/status";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Barcode } from "@/components/ui/Barcode";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { InwardWorkflow } from "@/features/inward/InwardWorkflow";
import { AddItemDialog } from "@/features/inward/AddItemDialog";
import { LineActions } from "@/features/inward/LineActions";
import { LineQtyEditor } from "@/features/inward/LineQtyEditor";
import { InvoiceUpload } from "@/features/inward/InvoiceUpload";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { PricingPanel } from "@/features/inward/PricingPanel";
import { getPricingLines, listAdditionalCosts } from "@/features/inward/pricing";
import { itemPhotoUrl } from "@/lib/storage";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/format";
import type { InwardLine } from "@/types/domain";

export default async function InwardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const inward = await getInward(id);
  const attachments = inward ? await listInwardAttachments(id) : [];

  // The pricing gate: only the owner, only once staff have submitted.
  const showPricing =
    inward !== null && inward.status === "submitted" && can(user.role, "inward.approve");

  const [pricingLines, additionalCosts] = showPricing
    ? await Promise.all([getPricingLines(id), listAdditionalCosts(id)])
    : [[], []];
  if (!inward) notFound();

  const isDraft = inward.status === "draft";
  // Only fetched when they can actually be used.
  const needsOptions = isDraft || showPricing;
  const formOptions = needsOptions ? await listItemFormOptions() : null;

  const columns: ReadonlyArray<Column<InwardLine>> = [
    {
      key: "photo",
      header: "",
      render: (l) => (
        <PhotoThumb src={itemPhotoUrl(l.photoPath)} alt={l.name} size={56} />
      ),
    },
    { key: "tag", header: "Tag", render: (l) => <Barcode code={l.barcode} /> },
    { key: "name", header: "Item", render: (l) => l.name },
    { key: "category", header: "Category", render: (l) => l.category },
    {
      key: "qty",
      header: "Received",
      numeric: true,
      render: (l) => (
        <LineQtyEditor
          lineId={l.id}
          inwardId={inward.id}
          qty={l.qty}
          editable={inward.status === "draft"}
        />
      ),
    },
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
    ...(isDraft
      ? [{
          key: "actions",
          header: "",
          render: (l: InwardLine) => (
            <LineActions lineId={l.id} inwardId={inward.id} />
          ),
        }]
      : []),
  ];

  const totalQty = inward.lines.reduce((s, l) => s + l.qty, 0);
  const totalShort = inward.lines.reduce((s, l) => s + l.qtyShort, 0);
  const withPhotos = inward.lines.filter((l) => l.photoPath).length;

  return (
    <>
      <PageHeader
        title={inward.docNo}
        description={`${inward.vendorName} · ${inward.locationCode}`}
        action={
          <Badge tone={INWARD_STATUS[inward.status].tone}>
            {INWARD_STATUS[inward.status].label}
          </Badge>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tally label="Lines" value={inward.lines.length} />
        <Tally label="Pieces received" value={totalQty} emphasis />
        <Tally label="Short" value={totalShort} />
        <Tally label="Photos" value={withPhotos} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          {isDraft && formOptions && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-text-muted">
                Add each design as you unpack it.
              </p>
              <AddItemDialog inwardId={inward.id} options={formOptions} />
            </div>
          )}

          {inward.lines.length === 0 ? (
            <EmptyState
              title="Nothing added yet"
              hint={
                isDraft
                  ? "Open the carton and add each design. A tag number is issued automatically for every item you save."
                  : "This document has no lines."
              }
            />
          ) : showPricing && formOptions ? (
            <PricingPanel
              inwardId={inward.id}
              lines={pricingLines}
              additionalCosts={additionalCosts}
              options={formOptions}
            />
          ) : (
            <DataTable columns={columns} rows={inward.lines} getKey={(l) => l.id} />
          )}
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

          <InvoiceUpload
            inwardId={inward.id}
            attachments={attachments}
            canUpload={inward.status === "draft"}
            canView={can(user.role, "inward.viewCost")}
          />

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

function Tally({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-card border border-border bg-surface px-3 py-2">
      <p className="text-2xs uppercase tracking-wide text-text-subtle">{label}</p>
      <p
        className={
          emphasis
            ? "tnum mt-0.5 text-2xl font-semibold tracking-tight"
            : "tnum mt-0.5 text-lg font-medium"
        }
      >
        {value}
      </p>
    </div>
  );
}
