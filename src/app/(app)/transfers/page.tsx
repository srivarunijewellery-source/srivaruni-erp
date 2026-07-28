import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { listTransfers } from "@/features/transfers/queries";
import { listStores } from "@/features/inward/queries";
import { TRANSFER_STATUS } from "@/config/status";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { TransferActions } from "@/features/transfers/TransferActions";
import { RequestTransferForm } from "@/features/transfers/RequestTransferForm";
import { formatDate } from "@/lib/format";
import type { TransferSummary } from "@/types/domain";

export const metadata: Metadata = { title: "Transfers" };

export default async function TransfersPage() {
  const user = await requireUser();
  const [transfers, stores] = await Promise.all([listTransfers(), listStores()]);

  const columns: ReadonlyArray<Column<TransferSummary>> = [
    { key: "doc", header: "Document", render: (r) => <span className="font-mono">{r.docNo}</span> },
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
      />

      {can(user.role, "transfer.request") && (
        <div className="mb-5">
          <RequestTransferForm stores={stores} defaultFromId={user.locationId} />
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
