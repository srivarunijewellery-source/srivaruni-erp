import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import {
  getProduct,
  getProductMovements,
  getProductSource,
  getCostBreakdown,
  getTransferPosition,
  getTransferActivity,
} from "@/features/products/queries";
import {
  listCategories,
  listItemFormOptions,
  listStores,
} from "@/features/inward/queries";
import { QtyAdjuster } from "@/features/products/QtyAdjuster";
import { can, isOwner } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductPhotos } from "@/features/products/ProductPhotos";
import { CostBreakdownCard } from "@/features/products/CostBreakdownCard";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatPaise } from "@/lib/money";
import { formatBps, marginBps } from "@/lib/pricing";
import { Badge } from "@/components/ui/Badge";
import { ProductDetailCard } from "@/features/products/ProductDetailCard";
import { formatDate } from "@/lib/format";

const STATUS_TONE = {
  pending_pricing: "pending",
  active: "done",
  inactive: "neutral",
  discontinued: "neutral",
} as const;

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const owner = isOwner(user.role);

  const [product, categories, options, stores, movements, source, breakdown,
         transferPosition, transferActivity] =
    await Promise.all([
      getProduct(id),
      listCategories(),
      listItemFormOptions(),
      listStores(),
      // Money on the movement rows is owner-only, and is not even
      // fetched otherwise.
      getProductMovements(id, owner),
      getProductSource(id),
      // Returns null for anyone but the owner: item_costs is owner-only
      // at the RLS level, so the card simply does not render for staff.
      getCostBreakdown(id),
      // What is committed to transfers, per store.
      getTransferPosition(id),
      getTransferActivity(id),
    ]);

  if (!product) notFound();

  const canEditPricing = can(user, "cost.view");

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Inventory", href: ROUTES.products },
          { label: "Products", href: ROUTES.products },
          { label: product.name },
        ]}
        title={product.name}
        description={[product.barcode, product.categoryName, product.variant]
          .filter(Boolean)
          .join(" · ")}
        action={
          <div className="flex items-center gap-3">
            <Badge tone={STATUS_TONE[product.status]}>{product.status}</Badge>
            <Link href={`${ROUTES.barcodes}?itemId=${product.id}`}>
              <Button size="sm" variant="secondary">
                Print barcode
              </Button>
            </Link>
            <Link href={ROUTES.products} className="text-sm text-brand hover:underline">
              All products
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          {breakdown && <CostBreakdownCard breakdown={breakdown} />}

          <ProductPhotos
            itemId={product.id}
            photos={product.photos.map((p) => ({
              id: p.id,
              storagePath: p.path,
              isPrimary: p.isPrimary,
            }))}
            canEdit={can(user, "catalog.manage")}
          />

          <Card>
            <CardHeader>
              <h2 className="font-medium">Stock</h2>
            </CardHeader>
            <CardBody>
              {product.byLocation.length === 0 ? (
                <p className="text-sm text-text-muted">Nothing on hand.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {product.byLocation.map((b) => (
                    <li key={b.code} className="flex justify-between">
                      <span className="font-mono text-2xs text-text-muted">{b.code}</span>
                      <span className="tnum font-medium">{b.qty}</span>
                    </li>
                  ))}
                </ul>
              )}
              {/* What is spoken for. On hand alone hides the box by the
                  door: a piece scanned into a transfer is physically gone
                  but still counted here until dispatch, and selling it
                  makes the transfer arrive short. */}
              {transferPosition.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-border pt-2">
                  {transferPosition.map((t) => (
                    <div key={t.locationCode}>
                      <p className="text-2xs uppercase tracking-wide text-text-subtle">
                        {t.locationCode} · in movement
                      </p>
                      <dl className="mt-0.5 space-y-0.5 text-2xs">
                        {t.requested > 0 && (
                          <MoveRow
                            k="Requested"
                            v={`${t.requested}`}
                            hint="still sellable — not yet committed"
                          />
                        )}
                        {t.picked > 0 && (
                          <MoveRow k="Picked" v={`${t.picked}`} hint="in the box" warn />
                        )}
                        {t.approved > 0 && (
                          <MoveRow k="Approved to send" v={`${t.approved}`} warn />
                        )}
                        {t.inTransit > 0 && (
                          <MoveRow
                            k="In transit"
                            v={`${t.inTransit}`}
                            hint="already out of the count above"
                          />
                        )}
                        <MoveRow
                          k="Net after transfers"
                          v={`${t.netAfter}`}
                          strong
                          warn={t.netAfter < 0}
                        />
                      </dl>
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-2 border-t border-border pt-2 text-2xs text-text-subtle">
                Added {formatDate(product.createdAt)}
              </p>

              {canEditPricing && (
                <div className="mt-3">
                  <QtyAdjuster
                    itemId={product.id}
                    stores={stores}
                    current={product.byLocation}
                  />
                </div>
              )}
            </CardBody>
          </Card>

          {/* Cost and margin.
              Freight, packing and hamali are prorated across the lines of
              an inward, so the adjusted cost is what this piece actually
              cost to put on the shelf — and that, not the bare vendor
              rate, is what every margin here is measured against. The
              rate is shown alongside it so the difference is visible
              rather than buried. */}
          {canEditPricing && (
            <Card>
              <CardHeader>
                <h2 className="font-medium">Cost and margin</h2>
              </CardHeader>
              <CardBody className="space-y-1 text-sm">
                {product.landedCostPaise === null ? (
                  <p className="text-text-muted">
                    No cost yet. It is worked out when the inward carrying this piece is
                    priced and approved.
                  </p>
                ) : (
                  <>
                    <Row label="Vendor rate" value={formatPaise(product.purchaseRatePaise)} />
                    <Row
                      label="Charges less bill discount"
                      value={
                        product.purchaseRatePaise !== null
                          ? formatPaise(product.landedCostPaise - product.purchaseRatePaise)
                          : "—"
                      }
                    />
                    <div className="flex justify-between border-t border-border pt-1 font-medium">
                      <span>Adjusted cost</span>
                      <span className="tnum">{formatPaise(product.landedCostPaise)}</span>
                    </div>

                    <div className="mt-2 space-y-1 border-t border-border pt-2">
                      <Row label="MRP" value={formatPaise(product.mrpPaise)} />
                      <Row label="Selling" value={formatPaise(product.sellingPricePaise)} />
                      <div className="flex justify-between font-medium">
                        <span>Margin on adjusted cost</span>
                        <span className="tnum">
                          {formatBps(
                            marginBps(product.sellingPricePaise, product.landedCostPaise),
                          )}
                        </span>
                      </div>
                      {product.purchaseRatePaise !== null &&
                        product.purchaseRatePaise !== product.landedCostPaise && (
                          <p className="text-2xs text-text-subtle">
                            On the bare rate it would read{" "}
                            {formatBps(
                              marginBps(product.sellingPricePaise, product.purchaseRatePaise),
                            )}
                            . The adjusted figure is the real one.
                          </p>
                        )}
                    </div>
                  </>
                )}
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-4 lg:col-span-2">
          <ProductDetailCard
            product={product}
            categories={categories}
            options={options}
            canEditPricing={canEditPricing}
          />

          <Card>
            <CardHeader>
              <h2 className="font-medium">Where it came from</h2>
            </CardHeader>
            <CardBody className="space-y-1 text-sm">
              {source.vendorName ? (
                <>
                  <SourceRow
                    label="Vendor"
                    value={
                      source.vendorId ? (
                        <Link
                          href={ROUTES.vendorDetail(source.vendorId)}
                          className="text-brand hover:underline"
                        >
                          {source.vendorName}
                        </Link>
                      ) : (
                        source.vendorName
                      )
                    }
                  />
                  <SourceRow
                    label="Received on"
                    value={
                      source.inwardId ? (
                        <Link
                          href={ROUTES.inwardDetail(source.inwardId)}
                          className="font-mono text-2xs text-brand hover:underline"
                        >
                          {source.docNo}
                        </Link>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <SourceRow label="Approved" value={formatDate(source.receivedAt)} />
                </>
              ) : source.assemblyId ? (
                <>
                  <SourceRow label="Origin" value="Made in-house" />
                  <SourceRow
                    label="Assembly"
                    value={
                      <Link
                        href={ROUTES.assemblyDetail(source.assemblyId)}
                        className="font-mono text-2xs text-brand hover:underline"
                      >
                        {source.docNo}
                      </Link>
                    }
                  />
                  <SourceRow
                    label="Approved"
                    value={source.receivedAt ? formatDate(source.receivedAt) : "not yet"}
                  />
                </>
              ) : (
                <p className="text-text-muted">
                  Created in the catalog and not yet received on any inward.
                </p>
              )}
            </CardBody>
          </Card>

          {/* Transfers, before the stock ledger.
              
              The ledger only records the moment stock physically moved,
              which for a transfer is dispatch. Everything before that —
              asked for, picked, approved — happened to this piece and
              belongs in its history, but cannot go in the ledger without
              corrupting every balance derived from it. */}
          {transferActivity.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="font-medium">Transfers</h2>
              </CardHeader>
              <CardBody className="p-0">
                <ul className="divide-y divide-border">
                  {transferActivity.map((a) => (
                    <li
                      key={`${a.docNo}-${a.happenedAt}`}
                      className="flex flex-wrap items-center gap-2 px-4 py-2 text-2xs"
                    >
                      <Link
                        href={ROUTES.transferDetail(a.transferId)}
                        className="font-mono text-brand hover:underline"
                      >
                        {a.docNo}
                      </Link>
                      <Badge tone={a.status === "received" ? "done" : "pending"}>
                        {a.stage}
                      </Badge>
                      <span className="tnum">{a.qty} pc</span>
                      <span className="text-text-subtle">
                        {a.fromCode}→{a.toCode}
                      </span>
                      {a.reason && (
                        <span className="truncate text-text-muted">{a.reason}</span>
                      )}
                      {/* The line that closes the loop: this was asked
                          for and can no longer be filled. */}
                      {a.unavailableReason && (
                        <span className="text-status-danger-fg">
                          {a.unavailableReason}
                        </span>
                      )}
                      <span className="ml-auto text-text-subtle">
                        {formatDate(a.happenedAt)}
                        {a.actor && ` · ${a.actor}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <h2 className="font-medium">Movement history</h2>
            </CardHeader>
            <CardBody className="p-0">
              {movements.length === 0 ? (
                <p className="px-4 py-4 text-center text-sm text-text-muted">
                  Nothing has moved yet.
                </p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-sunken">
                      <th className="px-2 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-text-muted">
                        When
                      </th>
                      <th className="px-2 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-text-muted">
                        Store
                      </th>
                      <th className="px-2 py-1.5 text-right text-2xs font-semibold uppercase tracking-wide text-text-muted">
                        In / out
                      </th>
                      <th className="px-2 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-text-muted">
                        Reason
                      </th>
                      {owner && (
                        <th className="px-2 py-1.5 text-right text-2xs font-semibold uppercase tracking-wide text-text-muted">
                          Sold for
                        </th>
                      )}
                      {owner && (
                        <th className="px-2 py-1.5 text-right text-2xs font-semibold uppercase tracking-wide text-text-muted">
                          Margin
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id} className="border-b border-border last:border-0">
                        <td className="px-2 py-1.5 text-2xs text-text-muted">
                          {formatDate(m.createdAt)}
                          {m.by && (
                            <span className="block text-text-subtle">{m.by}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-2xs">
                          {m.locationCode}
                        </td>
                        <td
                          className={`tnum px-2 py-1.5 text-right font-medium ${
                            m.qtyDelta < 0
                              ? "text-status-danger-fg"
                              : "text-status-done-fg"
                          }`}
                        >
                          {m.qtyDelta > 0 ? `+${m.qtyDelta}` : m.qtyDelta}
                        </td>
                        <td className="px-2 py-1.5 text-2xs">
                          {m.reason.replace(/_/g, " ")}
                          {m.note && (
                            <span className="block text-text-subtle">{m.note}</span>
                          )}
                          {/* The invoice and the buyer, both reachable.
                              "It sold" is never the end of the question —
                              who bought it and on which bill is what
                              someone wants next, and both sat here as
                              dead text. */}
                          {owner && m.billNo && (
                            <span className="block text-2xs">
                              <Link
                                href={`${ROUTES.sales}?q=${encodeURIComponent(m.billNo)}`}
                                className="font-mono text-brand hover:underline"
                              >
                                {m.billNo}
                              </Link>
                              {m.customerId ? (
                                <>
                                  {" · "}
                                  <Link
                                    href={ROUTES.customerDetail(m.customerId)}
                                    className="text-brand hover:underline"
                                  >
                                    {m.customerName ?? "customer"}
                                  </Link>
                                </>
                              ) : (
                                <span className="text-text-subtle"> · walk-in</span>
                              )}
                            </span>
                          )}
                        </td>
                        {owner && (
                          <td className="tnum px-2 py-1.5 text-right font-mono text-2xs">
                            {m.soldPaise === null ? (
                              <span className="text-text-subtle">—</span>
                            ) : (
                              <>
                                {formatPaise(m.soldPaise)}
                                {/* The cost this margin is measured
                                    against, so the number can be checked
                                    rather than taken on trust. */}
                                <span className="block text-text-subtle">
                                  cost {formatPaise(m.costPaise ?? 0)}
                                </span>
                              </>
                            )}
                          </td>
                        )}
                        {owner && (
                          <td className="tnum px-2 py-1.5 text-right font-mono text-2xs">
                            {m.marginPaise === null ? (
                              <span className="text-text-subtle">—</span>
                            ) : (
                              <span
                                className={
                                  m.marginPaise < 0
                                    ? "text-status-danger-fg"
                                    : "text-status-done-fg"
                                }
                              >
                                {formatPaise(m.marginPaise)}
                                <span className="block text-text-subtle">
                                  {m.soldPaise && m.soldPaise > 0
                                    ? `${((m.marginPaise / m.soldPaise) * 100).toFixed(0)}%`
                                    : ""}
                                </span>
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function SourceRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border py-1.5 last:border-0">
      <span className="text-text-muted">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-muted">{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}


/** One line of the in-movement block. Named apart from Row, which this
 *  file already uses for the "where it came from" card. */
function MoveRow({
  k,
  v,
  hint,
  warn,
  strong,
}: {
  k: string;
  v: string;
  hint?: string;
  warn?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className={warn ? "text-status-danger-fg" : "text-text-muted"}>
        {k}
        {hint && <span className="ml-1 text-text-subtle">· {hint}</span>}
      </dt>
      <dd className={`tnum ${strong ? "font-semibold" : ""}`}>{v}</dd>
    </div>
  );
}
