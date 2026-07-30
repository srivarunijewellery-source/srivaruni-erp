import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import {
  getTransfer,
  listPickableStock,
  listStockCategories,
} from "@/features/transfers/queries";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { TRANSFER_STATUS } from "@/config/status";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequestBuilder } from "@/features/transfers/RequestBuilder";
import { RequestFilters } from "@/features/transfers/RequestFilters";
import { PickPanel } from "@/features/transfers/PickPanel";
import { DispatchPanel } from "@/features/transfers/DispatchPanel";
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

  // Only a request is still being built, and only then is the shelf listed.
  const building = transfer.status === "requested";
  const [pickable, categories] = building
    ? await Promise.all([
        listPickableStock(transfer.fromCode, { query: q, category }),
        listStockCategories(transfer.fromCode),
      ])
    : [[], []];

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

      {/* ---------------------------------------------------- build a request */}
      {building && (
        <div className="space-y-4">
          {transfer.lines.length > 0 && (
            <Card>
              <CardHeader>
                <span className="font-medium">On the request</span>
              </CardHeader>
              <CardBody className="py-0">
                <LineProgress lines={transfer.lines} mode="pick" showAvailable />
              </CardBody>
            </Card>
          )}

          {can(user.role, "transfer.pick") && <PickPanel transfer={transfer} />}

          <RequestFilters
            transferId={transfer.id}
            categories={categories}
            query={q}
            category={category}
          />

          <RequestBuilder
            transferId={transfer.id}
            items={pickable}
            lines={transfer.lines}
            fromCode={transfer.fromCode}
          />
        </div>
      )}

      {/* ------------------------------------------------------------- picking */}
      {transfer.status === "picking" &&
        (can(user.role, "transfer.pick") ? (
          <PickPanel transfer={transfer} />
        ) : (
          <ReadOnly transfer={transfer} mode="pick" />
        ))}

      {/* -------------------------------------------------- approve and ship */}
      {(transfer.status === "picked" || transfer.status === "approved") &&
        (can(user.role, "transfer.approve") ? (
          <DispatchPanel transfer={transfer} />
        ) : (
          <ReadOnly
            transfer={transfer}
            mode="pick"
            hint="Packed and waiting on the owner to approve and ship."
          />
        ))}

      {/* ------------------------------------------------------------ receive */}
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

      {/* -------------------------------------------------------------- closed */}
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

      {building && transfer.lines.length === 0 && pickable.length === 0 && (
        <EmptyState
          title="Nothing to send"
          hint={`${transfer.fromName} is not holding any stock that matches.`}
        />
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

async function ReadOnly({
  transfer,
  mode,
  hint,
}: {
  transfer: Awaited<ReturnType<typeof getTransfer>>;
  mode: "pick" | "receive";
  hint?: string;
}) {
  if (!transfer) return null;
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
