import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { getTransfer, listPickableStock, listStockFilterOptions } from "@/features/transfers/queries";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { TRANSFER_STATUS } from "@/config/status";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { RequestBuilder } from "@/features/transfers/RequestBuilder";
import { StockFilterBar, type StockFilterState } from "@/features/transfers/StockFilterBar";
import { PickPanel } from "@/features/transfers/PickPanel";
import { ApprovalPanel } from "@/features/transfers/ApprovalPanel";
import { ShippingPanel } from "@/features/transfers/ShippingPanel";
import { ReceivePanel } from "@/features/transfers/ReceivePanel";
import { LineProgress } from "@/features/transfers/LineProgress";
import { formatDateTime } from "@/lib/format";
import { formatPaise } from "@/lib/money";

export const metadata: Metadata = { title: "Transfer" };

export default async function TransferDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { id } = await params;
  const { q = "", category = "" } = await searchParams;

  const [user, transfer] = await Promise.all([requireUser(), getTransfer(id)]);
  if (!transfer) notFound();

  const status = TRANSFER_STATUS[transfer.status];
  const value = transfer.lines.reduce(
    (n, l) => n + (l.sellingPricePaise ?? 0) * (l.qtySent || l.qtyRequested),
    0,
  );

  // Requests are now built before they exist (see /transfers/new), so a
  // request that has reached this page already has its lines. This section
  // only covers adding a forgotten item to one still sitting at "requested".
  const canAddMore = transfer.status === "requested" && can(user.role, "transfer.request");
  const [pickable, filterOptions] = canAddMore
    ? await Promise.all([
        listPickableStock(transfer.fromLocationId, { query: q, category }),
        listStockFilterOptions(transfer.fromLocationId),
      ])
    : [[], { categories: [], itemTypes: [], platings: [] }];

  const filterValue: StockFilterState = {
    from: transfer.fromLocationId,
    q,
    category,
    itemType: "",
    plating: "",
    inStock: true,
    minAge: "",
  };

  return (
    <>
      <PageHeader
        title={transfer.docNo}
        description={`${transfer.fromName} → ${transfer.toName}`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            <Link href={ROUTES.transfers}>
              <Button size="sm" variant="ghost">
                All transfers
              </Button>
            </Link>
          </div>
        }
      />

      {/* Whatever the next legal action is, it comes first -- not after a
          screen of metadata someone has to scroll past to find it. */}
      <div className="mb-4">
        {transfer.status === "requested" && can(user.role, "transfer.pick") && (
          <PickPanel transfer={transfer} />
        )}
        {transfer.status === "picking" &&
          (can(user.role, "transfer.pick") ? (
            <PickPanel transfer={transfer} />
          ) : (
            <ReadOnly transfer={transfer} mode="pick" />
          ))}
        {transfer.status === "picked" &&
          (can(user.role, "transfer.approve") ? (
            <ApprovalPanel transfer={transfer} />
          ) : (
            <ReadOnly
              transfer={transfer}
              mode="pick"
              hint="Packed and sent for approval. Waiting on a manager or the owner to review."
            />
          ))}
        {transfer.status === "approved" &&
          (can(user.role, "transfer.dispatch") ? (
            <ShippingPanel transfer={transfer} />
          ) : (
            <ReadOnly
              transfer={transfer}
              mode="pick"
              hint="Approved. Waiting to be handed to the courier and shipped."
            />
          ))}
        {transfer.status === "dispatched" &&
          (can(user.role, "transfer.receive") ? (
            <ReceivePanel transfer={transfer} />
          ) : (
            <ReadOnly
              transfer={transfer}
              mode="receive"
              hint={`In transit. Belongs to no store until ${transfer.toCode} confirms receipt.`}
            />
          ))}
        {(transfer.status === "received" ||
          transfer.status === "rejected" ||
          transfer.status === "cancelled") && (
          <ReadOnly
            transfer={transfer}
            mode="receive"
            hint={
              transfer.status === "received"
                ? `Booked into ${transfer.toName} on ${formatDateTime(transfer.receivedAt)}.`
                : undefined
            }
          />
        )}
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardBody className="grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Reason" value={transfer.reason} />
            <Detail label="Note" value={transfer.note} />
            <Detail label="Raised" value={formatDateTime(transfer.requestedAt)} />
            <Detail label="Packed" value={formatDateTime(transfer.pickedAt)} />
            <Detail label="Approved" value={formatDateTime(transfer.approvedAt)} />
            <Detail label="Dispatched" value={formatDateTime(transfer.dispatchedAt)} />
            {transfer.courier && <Detail label="Courier" value={transfer.courier} />}
            {transfer.docketNo && <Detail label="Docket" value={transfer.docketNo} mono />}
            {transfer.rejectedReason && (
              <Detail label="Sent back because" value={transfer.rejectedReason} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-1">
            <p className="text-2xs uppercase tracking-wide text-text-muted">On this document</p>
            <p className="tnum font-mono text-2xl font-semibold">
              {transfer.lines.reduce((n, l) => n + (l.qtySent || l.qtyRequested), 0)}
            </p>
            <p className="text-sm text-text-muted">
              {transfer.lines.length} {transfer.lines.length === 1 ? "item" : "items"} ·{" "}
              {formatPaise(value)} at retail
            </p>
          </CardBody>
        </Card>
      </div>

      {canAddMore && (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Forgot something? Add it here before picking starts.
          </p>
          <StockFilterBar
            basePath={ROUTES.transferDetail(transfer.id)}
            locations={[]}
            options={filterOptions}
            value={filterValue}
            lockFrom
          />
          <RequestBuilder
            transferId={transfer.id}
            items={pickable}
            lines={transfer.lines}
            fromCode={transfer.fromCode}
          />
        </div>
      )}
    </>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-2xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className={mono ? "font-mono" : undefined}>{value || "—"}</p>
    </div>
  );
}

function ReadOnly({
  transfer,
  mode,
  hint,
}: {
  transfer: NonNullable<Awaited<ReturnType<typeof getTransfer>>>;
  mode: "pick" | "receive";
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <span className="font-medium">Lines</span>
        {transfer.pickNote && (
          <span className="text-2xs text-text-muted">“{transfer.pickNote}”</span>
        )}
      </CardHeader>
      <CardBody className="py-0">
        <LineProgress lines={transfer.lines} mode={mode} />
      </CardBody>
      {hint && (
        <CardBody className="border-t border-border">
          <p className="text-sm text-text-muted">{hint}</p>
        </CardBody>
      )}
    </Card>
  );
}
