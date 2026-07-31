import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import {
  listAdjustments,
  listCorrectionMovements,
} from "@/features/adjustments/queries";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Barcode } from "@/components/ui/Barcode";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Stock adjustments" };

const REASON_TONE: Record<string, "pending" | "danger" | "neutral"> = {
  adjustment: "pending",
  damage: "danger",
  count_variance: "danger",
  lost_in_transit: "danger",
};

export default async function AdjustmentsPage() {
  await requireUser();
  const [docs, movements] = await Promise.all([
    listAdjustments(),
    listCorrectionMovements(),
  ]);

  const added = movements.filter((m) => m.qtyDelta > 0).reduce((s, m) => s + m.qtyDelta, 0);
  const removed = movements
    .filter((m) => m.qtyDelta < 0)
    .reduce((s, m) => s + Math.abs(m.qtyDelta), 0);

  return (
    <>
      <PageHeader
        title="Stock adjustments"
        description="Every correction, write-off and transit loss, with who made it and why."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Documents" value={String(docs.length)} />
        <Stat label="Movements" value={String(movements.length)} />
        <Stat label="Pieces added" value={String(added)} />
        <Stat label="Pieces removed" value={String(removed)} emphasis />
      </div>

      {movements.length === 0 ? (
        <EmptyState
          title="No adjustments recorded"
          hint="Corrections raised on the shop floor and quantity edits made on a product both appear here."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <h2 className="font-medium">Movements</h2>
            </CardHeader>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-sunken">
                      <Th>Item</Th>
                      <Th>Store</Th>
                      <Th right>Change</Th>
                      <Th>Reason</Th>
                      <Th>When</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id} className="border-b border-border last:border-0">
                        <td className="px-2 py-1.5">
                          <Link
                            href={ROUTES.productDetail(m.itemId)}
                            className="block truncate hover:text-brand"
                          >
                            {m.name}
                          </Link>
                          <Barcode code={m.barcode} />
                        </td>
                        <td className="px-2 py-1.5 font-mono text-2xs">{m.locationCode}</td>
                        <td
                          className={`tnum px-2 py-1.5 text-right font-medium ${
                            m.qtyDelta < 0 ? "text-status-danger-fg" : "text-status-done-fg"
                          }`}
                        >
                          {m.qtyDelta > 0 ? `+${m.qtyDelta}` : m.qtyDelta}
                        </td>
                        <td className="px-2 py-1.5">
                          <Badge tone={REASON_TONE[m.reason] ?? "neutral"}>
                            {m.reason.replace("_", " ")}
                          </Badge>
                          {m.note && (
                            <p className="mt-0.5 max-w-[16rem] truncate text-2xs text-text-muted">
                              {m.note}
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-2xs text-text-muted">
                          {formatDateTime(m.createdAt)}
                          {m.by && <span className="block text-text-subtle">{m.by}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-medium">Documents</h2>
            </CardHeader>
            <CardBody className="p-0">
              {docs.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-text-muted">
                  No adjustment documents.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {docs.map((d) => (
                    <li key={d.id} className="px-3 py-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="whitespace-nowrap font-mono text-2xs">
                          {d.docNo}
                        </span>
                        <Badge tone={d.status === "approved" ? "done" : "pending"}>
                          {d.status}
                        </Badge>
                      </div>
                      <p className="text-sm">{d.reason ?? "—"}</p>
                      <p className="text-2xs text-text-muted">
                        {d.locationCode} · {d.lines.length}{" "}
                        {d.lines.length === 1 ? "item" : "items"} ·{" "}
                        {formatDateTime(d.createdAt)}
                        {d.createdBy ? ` · ${d.createdBy}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text-muted ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Stat({
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
      <p className={emphasis ? "tnum mt-0.5 text-xl font-semibold" : "tnum mt-0.5 text-base font-medium"}>
        {value}
      </p>
    </div>
  );
}
