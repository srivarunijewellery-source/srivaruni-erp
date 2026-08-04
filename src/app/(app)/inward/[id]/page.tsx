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
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/config/nav";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { InwardWorkflow } from "@/features/inward/InwardWorkflow";
import { LinesSection } from "@/features/inward/LinesSection";
import { InwardDocTable } from "@/features/inward/InwardDocTable";
import { DocModeSwitch } from "@/features/inward/DocModeSwitch";
import { InvoiceUpload } from "@/features/inward/InvoiceUpload";
import { BillDetails } from "@/features/inward/BillDetails";
import { PricingPanel } from "@/features/inward/PricingPanel";
import {
  listBands, getInwardVendorPricing, getInwardDiscount, getInwardCostTotals,
} from "@/features/pricing/queries";
import { formatPaise } from "@/lib/money";

export default async function InwardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const inward = await getInward(id);
  if (!inward) notFound();

  const isOwner = can(user, "inward.approve");
  const isDraft = inward.status === "draft";

  // Pricing stays available AFTER approval too, so the owner can correct
  // a rate later. Approval is a gate, not a lock.
  const showPricing =
    isOwner && (inward.status === "submitted" || inward.status === "approved");

  // Every one of these is a separate round trip to Mumbai, so they run
  // in parallel. Adding a sequential await here is the single easiest
  // way to make this page feel slow again.
  const [
    attachments, vendors, formOptions, pricingLines,
    additionalCosts, taxSummary, priceBands, vendorPricing, inwardDiscount, costTotals,
  ] = await Promise.all([
    listInwardAttachments(id),
    listVendors(),
    isDraft || showPricing ? listItemFormOptions() : Promise.resolve(null),
    showPricing ? getPricingLines(id) : Promise.resolve([]),
    showPricing ? listAdditionalCosts(id) : Promise.resolve([]),
    showPricing ? getTaxSummary(id) : Promise.resolve(null),
    showPricing ? listBands() : Promise.resolve([]),
    showPricing ? getInwardVendorPricing(id) : Promise.resolve(null),
    showPricing
      ? getInwardDiscount(id)
      : Promise.resolve({ kind: "none" as const, bps: null, paise: null }),
    showPricing ? getInwardCostTotals(id) : Promise.resolve(null),
  ]);

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


  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Purchases", href: ROUTES.inward },
          { label: "Material inward", href: ROUTES.inward },
          { label: inward.docNo },
        ]}
        title={inward.docNo}
        description={`${inward.vendorName} · ${inward.locationCode}`}
        action={
          <div className="flex items-center gap-3">
            <Link href={`${ROUTES.barcodes}?inwardId=${inward.id}`}>
              <Button size="sm" variant="secondary">
                Print barcodes
              </Button>
            </Link>
            <Badge tone={INWARD_STATUS[inward.status].tone}>
              {INWARD_STATUS[inward.status].label}
            </Badge>
          </div>
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
        {/* Keyed on status so approving drops you back to the document
            view. Without this, editing state survives the revalidation
            and the pricing panel re-renders in its locked state, which
            reads as "already approved" fired at the wrong moment. */}
        <DocModeSwitch
          key={inward.status}
          canEdit={isDraft || showPricing}
          editLabel={showPricing ? "Enter pricing" : "Edit lines"}
          document={
            <InwardDocTable
              lines={inward.lines}
              pricing={pricingLines}
              additionalCosts={additionalCosts}
              tax={taxSummary}
              showCost={isOwner}
            />
          }
          editor={
            showPricing && formOptions ? (
              <PricingPanel
                inwardId={inward.id}
                lines={pricingLines}
                additionalCosts={additionalCosts}
                options={formOptions}
                tax={taxSummary}
                bands={priceBands}
                vendorPricing={vendorPricing}
                discount={inwardDiscount}
                isApproved={inward.status === "approved"}
              />
            ) : (
              <LinesSection
                inwardId={inward.id}
                lines={inward.lines}
                editable={isDraft}
                options={formOptions}
              />
            )
          }
        />

        {/* Owner-only money footer. Staff see the quantity totals above
            but never a value, because no cost rows reach their session. */}
        {isOwner && pricingLines.length > 0 && (
          <Card>
            <CardBody>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Foot label="Lines priced" value={`${pricedLines} / ${pricingLines.length}`} />
                <Foot label="Pieces" value={String(totalQty)} />
                <Foot label="Gross (rate x qty)" value={formatPaise(costTotals?.grossPaise ?? purchaseValue)} />
                <Foot
                  label="Bill discount"
                  value={
                    costTotals && costTotals.discountPaise > 0
                      ? `- ${formatPaise(costTotals.discountPaise)}`
                      : "—"
                  }
                />
                <Foot label="Taxable" value={formatPaise(costTotals?.taxablePaise ?? 0)} />
                <Foot label="GST" value={formatPaise(costTotals?.taxPaise ?? 0)} />
                <Foot
                  label="Freight and packing"
                  value={additionalTotal > 0 ? formatPaise(additionalTotal) : "—"}
                />
                <Foot
                  label="Landed total"
                  value={formatPaise(costTotals?.landedPaise ?? 0)}
                  emphasis
                />
              </div>
              <p className="mt-3 border-t border-border pt-3 text-2xs text-text-muted">
                Gross is rate x quantity as typed. The bill discount comes off before GST,
                so taxable is the net. Landed total is what this carton cost to put on the
                shelf: taxable{costTotals?.itcEligible === false ? " plus GST" : ""} plus the
                prorated freight and packing. It is the figure every margin is measured
                against.
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

function Foot({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="text-2xs uppercase tracking-wide text-text-subtle">{label}</p>
      <p
        className={
          emphasis
            ? "tnum mt-0.5 text-lg font-semibold text-brand"
            : "tnum mt-0.5 text-lg font-medium"
        }
      >
        {value}
      </p>
    </div>
  );
}
