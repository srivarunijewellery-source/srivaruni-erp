import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import {
  getInward,
  listItemFormOptions,
  listInwardAttachments,
  listVendors,
} from "@/features/inward/queries";
import {
  getPricingLines,
  listAdditionalCosts,
  getTaxSummary,
} from "@/features/inward/pricing";
import { can } from "@/config/roles";
import { INWARD_STATUS } from "@/config/status";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Barcode } from "@/components/ui/Barcode";
import { Card, CardBody } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { InwardWorkflow } from "@/features/inward/InwardWorkflow";
import { AddItemDialog } from "@/features/inward/AddItemDialog";
import { LineActions } from "@/features/inward/LineActions";
import { LineQtyEditor } from "@/features/inward/LineQtyEditor";
import { InvoiceUpload } from "@/features/inward/InvoiceUpload";
import { BillDetails } from "@/features/inward/BillDetails";
import { PricingPanel } from "@/features/inward/PricingPanel";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
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

  const isOwner = can(user.role, "inward.approve");
  const isDraft = inward.status === "draft";

  // Pricing stays available AFTER approval too, so the owner can correct
  // a rate later. Approval is a gate, not a lock.
  const showPricing =
    isOwner && (inward.status === "submitted" || inward.status === "approved");

  const [attachments, vendors, formOptions, pricingLines, additionalCosts] =
    await Promise.all([
    listInwardAttachments(id),
    listVendors(),
    isDraft || showPricing ? listItemFormOptions() : Promise.resolve(null),
    showPricing ? getPricingLines(id) : Promise.resolve([]),
    showPricing ? listAdditionalCosts(id) : Promise.resolve([]),
  ]);

  const taxSummary = showPricing ? await getTaxSummary(id) : null;

  const totalQty = inward.lines.reduce((s, l) => s + l.qty, 0);
  const totalShort = inward.lines.reduce((s, l) => s + l.qtyShort, 0);
  const withPhotos = inward.lines.filter((l) => l.photoPath).length;

  // Purchase value is owner-only: pricingLines is empty for staff because
  // inward_line_costs returns no rows to them under RLS.
  const purchaseValue = pricingLines.reduce(
    (s, l) => s + (l.ratePaise ?? 0) * l.qty,
    0,
  );
  const additionalTotal = additionalCosts.reduce((s, c) => s + c.amountPaise, 0);
  const pricedLines = pricingLines.filter((l) => l.ratePaise !== null).length;

  const columns: ReadonlyArray<Column<InwardLine>> = [
    {
      key: "photo",
      header: "",
      render: (l) => <PhotoThumb src={itemPhotoUrl(l.photoPath)} alt={l.name} size={56} />,
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
          editable={isDraft}
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
      ? [
          {
            key: "actions",
            header: "",
            render: (l: InwardLine) => (
              <LineActions lineId={l.id} inwardId={inward.id} />
            ),
          },
        ]
      : []),
  ];

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

      {/* Bill, document facts and the workflow action sit at the top so
          the line table below gets the full page width. */}
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <BillDetails
          inwardId={inward.id}
          vendorId={inward.vendorId}
          vendorName={inward.vendorName}
          invoiceNo={inward.vendorInvoiceNo}
          invoiceDate={inward.vendorInvoiceDate}
          createdAt={inward.createdAt}
          submittedAt={inward.submittedAt}
          approvedAt={inward.approvedAt}
          rejectedReason={inward.rejectedReason}
          vendors={vendors}
        />

        <InvoiceUpload
          inwardId={inward.id}
          attachments={attachments}
          canUpload={isDraft}
          canView={isOwner}
        />

        <InwardWorkflow
          inwardId={inward.id}
          status={inward.status}
          canApprove={isOwner}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tally label="Lines" value={String(inward.lines.length)} />
        <Tally label="Pieces received" value={String(totalQty)} emphasis />
        <Tally label="Short" value={String(totalShort)} />
        <Tally label="With photos" value={`${withPhotos} / ${inward.lines.length}`} />
      </div>

      <div className="space-y-3">
        {isDraft && formOptions && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-muted">Add each design as you unpack it.</p>
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
            tax={taxSummary}
          />
        ) : (
          <DataTable columns={columns} rows={inward.lines} getKey={(l) => l.id} />
        )}

        {/* Owner-only money footer. Staff see the quantity totals above
            but never a value, because no cost rows reach their session. */}
        {isOwner && pricingLines.length > 0 && (
          <Card>
            <CardBody>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Foot label="Lines priced" value={`${pricedLines} / ${pricingLines.length}`} />
                <Foot label="Pieces" value={String(totalQty)} />
                <Foot label="Purchase value" value={formatPaise(purchaseValue)} />
                <Foot
                  label="Freight and packing"
                  value={additionalTotal > 0 ? formatPaise(additionalTotal) : "—"}
                />
              </div>
              <p className="mt-3 border-t border-border pt-3 text-2xs text-text-muted">
                Purchase value is rate x quantity as entered. The taxable amount, GST
                split and prorated landed cost are computed at approval from the
                vendor&apos;s tax setup.
              </p>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}

function Tally({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
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

function Foot({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xs uppercase tracking-wide text-text-subtle">{label}</p>
      <p className="tnum mt-0.5 text-lg font-medium">{value}</p>
    </div>
  );
}
