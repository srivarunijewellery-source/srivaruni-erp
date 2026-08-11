import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { listTransfers } from "@/features/transfers/queries";
import { getTransferPipeline } from "@/features/transfers/actions";
import { TransferPipeline } from "@/features/transfers/TransferPipeline";
import { TRANSFER_STATUS } from "@/config/status";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { TransferActions } from "@/features/transfers/TransferActions";
import { formatDate } from "@/lib/format";
import type { TransferSummary } from "@/types/domain";

export const metadata: Metadata = { title: "Transfers" };

export default async function TransfersPage() {
  const user = await requireUser();
  const [transfers, pipeline] = await Promise.all([
    listTransfers(),
    getTransferPipeline(),
  ]);

  const columns: ReadonlyArray<Column<TransferSummary>> = [
    {
      key: "doc",
      header: "Document",
      // The document number opens the transfer. Without this the only
      // way in was the Pick button, which starts picking rather than
      // showing you the request -- so a transfer that had been raised
      // could be acted on but never read or corrected.
      render: (r) => (
        <Link
          href={ROUTES.transferDetail(r.id)}
          className="font-mono text-brand hover:underline"
        >
          {r.docNo}
        </Link>
      ),
    },
    {
      key: "route",
      header: "Route",
      render: (r) => (
        <span className="font-mono text-2xs">
          {r.fromCode} → {r.toCode}
        </span>
      ),
    },
    { key: "reason", header: "Reason", render: (r) => r.reason ?? "—" },
    { key: "sent", header: "Sent", numeric: true, render: (r) => r.qtySent },
    {
      key: "received",
      header: "Received",
      numeric: true,
      render: (r) =>
        r.status === "received" && r.qtyReceived < r.qtySent ? (
          <span className="text-status-danger-fg">{r.qtyReceived}</span>
        ) : (
          r.qtyReceived || "—"
        ),
    },
    { key: "date", header: "Raised", render: (r) => formatDate(r.requestedAt) },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge tone={TRANSFER_STATUS[r.status].tone}>{TRANSFER_STATUS[r.status].label}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => <TransferActions transfer={r} role={user.role} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Transfers"
        description="Anyone can raise a request. Stock only moves once it is approved, and lands only when the receiving store confirms."
        action={
          can(user, "transfer.request") && (
            <div className="flex gap-2">
              {/* Straight to picking, skipping the request. There is
                  nobody to ask when the owner is deciding what to send. */}
              <Link href={`${ROUTES.transferNew}?mode=pick`}>
                <Button variant="secondary">Pick directly</Button>
              </Link>
              <Link href={ROUTES.transferNew}>
                <Button variant="primary">New transfer</Button>
              </Link>
            </div>
          )
        }
      />

      {/* What is in movement, before the list of documents: the question
          is usually "what is out there", not "which papers exist". */}
      {pipeline.ok && pipeline.data.length > 0 && (
        <div className="mb-4">
          <TransferPipeline cells={pipeline.data} />
        </div>
      )}

      {transfers.length === 0 ? (
        <EmptyState
          title="No transfers yet"
          hint="Raise a request when one store needs stock the other is holding."
        />
      ) : (
        <DataTable columns={columns} rows={transfers} getKey={(r) => r.id} />
      )}
    </>
  );
}
