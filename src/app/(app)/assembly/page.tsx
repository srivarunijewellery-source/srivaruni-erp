import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDate, pluralise } from "@/lib/format";
import { listAssemblies } from "@/features/assembly/queries";
import { NewAssemblyButton } from "@/features/assembly/NewAssemblyButton";
import { listStores } from "@/features/inward/queries";

export const metadata: Metadata = { title: "Assembly" };

const TONE = {
  draft: "neutral", submitted: "pending", approved: "done", rejected: "danger",
} as const;

export default async function AssemblyListPage() {
  const user = await requireUser();
  if (!can(user, "inward.create")) {
    return <EmptyState title="You do not have access to assembly" />;
  }

  const [rows, stores] = await Promise.all([listAssemblies(), listStores()]);

  return (
    <>
      <PageHeader
        title="Assembly"
        description="Pieces made in-house from raw materials already in stock."
      />
      <div className="mb-4">
        <NewAssemblyButton stores={stores.map((s) => ({ id: s.id, code: s.code, name: s.name }))} />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nothing assembled yet" />
      ) : (
        <Card>
          <CardBody className="p-0">
            <ul className="divide-y divide-border">
              {rows.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/assembly/${a.id}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-sunken"
                  >
                    <span className="w-36 font-mono text-sm">{a.docNo}</span>
                    <span className="min-w-32 flex-1 text-sm text-text-muted">
                      {a.locationCode} · {a.productCount}{" "}
                      {pluralise(a.productCount, "product")} · {a.totalQty}{" "}
                      {pluralise(a.totalQty, "piece")}
                    </span>
                    <span className="text-2xs text-text-subtle">
                      {formatDate(a.createdAt)}
                    </span>
                    <Badge tone={TONE[a.status]}>{a.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </>
  );
}
