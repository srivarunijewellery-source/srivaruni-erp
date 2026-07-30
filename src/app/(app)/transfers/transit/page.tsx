import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { listTransitBoxes, listTransitStock } from "@/features/transfers/queries";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { itemPhotoUrl } from "@/lib/storage";
import { formatDateTime, pluralise } from "@/lib/format";
import { formatPaise } from "@/lib/money";

export const metadata: Metadata = { title: "In transit" };

/**
 * Stock that has left one store and arrived at neither.
 *
 * This screen exists because that state is otherwise invisible: it is
 * excluded from stock_on_hand by design, so without a surface of its own
 * a box on a bus simply looks like stock that vanished. Everything here
 * belongs to no location and is sellable nowhere.
 */
export default async function TransitPage() {
  await requireUser();

  const [boxes, rows] = await Promise.all([listTransitBoxes(), listTransitStock()]);

  const units = boxes.reduce((n, b) => n + b.qtyInTransit, 0);
  const value = boxes.reduce((n, b) => n + b.valuePaise, 0);
  const overdue = boxes.filter((b) => b.overdue);

  if (boxes.length === 0) {
    return (
      <>
        <PageHeader
          title="In transit"
          description="Stock that has left one store and not yet landed at another."
        />
        <EmptyState
          title="Nothing on the road"
          hint="Every piece is sitting in a store. When a transfer is shipped it appears here until the receiving store confirms it."
          action={
            <Link href={ROUTES.transfers}>
              <Button variant="secondary">Go to transfers</Button>
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="In transit"
        description="Allocated to no store. Not sellable anywhere until receipt is confirmed."
        action={
          <Link href={ROUTES.transfers}>
            <Button size="sm" variant="ghost">
              All transfers
            </Button>
          </Link>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Pieces in transit" value={String(units)} />
        <Stat label="Value at retail" value={formatPaise(value)} />
        <Stat
          label="Boxes on the road"
          value={String(boxes.length)}
          hint={
            overdue.length > 0
              ? `${overdue.length} out ${pluralise(overdue.length, "box has", "boxes have")} been moving over 3 days`
              : undefined
          }
          alert={overdue.length > 0}
        />
      </div>

      <div className="space-y-4">
        {boxes.map((box) => {
          const contents = rows.filter((r) => r.transferId === box.transferId);

          return (
            <Card key={box.transferId}>
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={ROUTES.transferDetail(box.transferId)}
                    className="font-mono font-medium underline-offset-2 hover:underline"
                  >
                    {box.docNo}
                  </Link>
                  <span className="font-mono text-2xs text-text-muted">
                    {box.fromCode} → {box.toCode}
                  </span>
                  <Badge tone={box.overdue ? "danger" : "transit"}>
                    {box.daysInTransit === 0
                      ? "Shipped today"
                      : `${box.daysInTransit} ${pluralise(box.daysInTransit, "day")} in transit`}
                  </Badge>
                </div>
                <span className="tnum font-mono text-sm">
                  {box.qtyInTransit} {pluralise(box.qtyInTransit, "piece")} ·{" "}
                  {formatPaise(box.valuePaise)}
                </span>
              </CardHeader>

              <CardBody className="space-y-3">
                <p className="text-2xs text-text-muted">
                  Dispatched {formatDateTime(box.dispatchedAt)}
                  {box.courier && <> by {box.courier}</>}
                  {box.docketNo && (
                    <>
                      {" "}
                      · docket <span className="font-mono">{box.docketNo}</span>
                    </>
                  )}
                </p>

                <ul className="flex flex-wrap gap-3">
                  {contents.map((r) => (
                    <li
                      key={`${r.transferId}-${r.itemId}`}
                      className="flex w-56 items-center gap-2 rounded-control border border-border p-2"
                    >
                      <PhotoThumb src={itemPhotoUrl(r.photoPath)} alt={r.itemName} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-2xs font-medium">{r.itemName}</p>
                        <p className="font-mono text-2xs text-text-muted">{r.barcode}</p>
                      </div>
                      <span className="tnum font-mono text-sm font-semibold">{r.qty}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex gap-2">
                  <Link href={ROUTES.transferDetail(box.transferId)}>
                    <Button size="sm" variant="primary">
                      Receive at {box.toCode}
                    </Button>
                  </Link>
                  <a href={ROUTES.transferSlip(box.transferId)} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="secondary">
                      Pickup slip
                    </Button>
                  </a>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  alert,
}: {
  label: string;
  value: string;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <Card>
      <CardBody>
        <p className="text-2xs uppercase tracking-wide text-text-muted">{label}</p>
        <p className="tnum mt-0.5 font-mono text-2xl font-semibold">{value}</p>
        {hint && (
          <p className={alert ? "mt-1 text-2xs text-status-danger-fg" : "mt-1 text-2xs text-text-muted"}>
            {hint}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
