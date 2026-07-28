import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { listInwards } from "@/features/inward/queries";
import { listTransfers } from "@/features/transfers/queries";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { INWARD_STATUS, TRANSFER_STATUS } from "@/config/status";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDate, pluralise } from "@/lib/format";

export default async function DashboardPage() {
  const user = await requireUser();
  const [inwards, transfers] = await Promise.all([listInwards(), listTransfers()]);

  const awaitingPricing = inwards.filter((i) => i.status === "submitted");
  const awaitingApproval = transfers.filter((t) => t.status === "requested");
  const inTransit = transfers.filter((t) => t.status === "dispatched");

  const queue = can(user.role, "inward.approve") ? awaitingPricing : [];

  return (
    <>
      <PageHeader
        title={`Good day, ${user.name}`}
        description={
          user.locationCode
            ? `Signed in at ${user.locationCode}.`
            : "Signed in across all locations."
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Awaiting pricing" value={awaitingPricing.length} href={ROUTES.inward} />
        <Stat label="Transfers to approve" value={awaitingApproval.length} href={ROUTES.transfers} />
        <Stat label="In transit" value={inTransit.length} href={ROUTES.transfers} />
      </div>

      {can(user.role, "inward.approve") && (
        <Card className="mt-6">
          <CardHeader>
            <h2 className="font-medium">Your approval queue</h2>
          </CardHeader>
          <CardBody>
            {queue.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-muted">
                Nothing waiting on you. Stock stays unsellable until you price it.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {queue.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={ROUTES.inwardDetail(i.id)}
                        className="font-mono text-sm hover:text-brand"
                      >
                        {i.docNo}
                      </Link>
                      <p className="truncate text-sm text-text-muted">
                        {i.vendorName} · {i.lineCount} {pluralise(i.lineCount, "line")} ·{" "}
                        {i.totalQty} {pluralise(i.totalQty, "piece")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-2xs text-text-subtle">
                        {formatDate(i.submittedAt)}
                      </span>
                      <Badge tone={INWARD_STATUS[i.status].tone}>
                        {INWARD_STATUS[i.status].label}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader>
          <h2 className="font-medium">Transfers in flight</h2>
        </CardHeader>
        <CardBody>
          {inTransit.length === 0 ? (
            <p className="py-4 text-center text-sm text-text-muted">
              Nothing on the road.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {inTransit.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <span className="font-mono text-sm">{t.docNo}</span>
                    <p className="text-sm text-text-muted">
                      {t.fromCode} → {t.toCode} · {t.qtySent}{" "}
                      {pluralise(t.qtySent, "piece")}
                    </p>
                  </div>
                  <Badge tone={TRANSFER_STATUS[t.status].tone}>
                    {TRANSFER_STATUS[t.status].label}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="block">
      <Card className="transition-shadow hover:shadow-raised">
        <CardBody>
          <p className="text-sm text-text-muted">{label}</p>
          <p className="tnum mt-1 text-3xl font-semibold tracking-tight">{value}</p>
        </CardBody>
      </Card>
    </Link>
  );
}
