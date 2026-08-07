import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import {
  getProduct,
  getProductMovements,
  getProductSource,
  getCostBreakdown,
} from "@/features/products/queries";
import {
  listCategories,
  listItemFormOptions,
  listStores,
} from "@/features/inward/queries";
import { QtyAdjuster } from "@/features/products/QtyAdjuster";
import { can } from "@/config/roles";
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

  const [product, categories, options, stores, movements, source, breakdown] =
    await Promise.all([
      getProduct(id),
      listCategories(),
      listItemFormOptions(),
      listStores(),
      getProductMovements(id),
      getProductSource(id),
      // Returns null for anyone but the owner: item_costs is owner-only
      // at the RLS level, so the card simply does not render for staff.
      getCostBreakdown(id),
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
        description={`${product.barcode} · ${product.categoryName}`}
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
              ) : (
                <p className="text-text-muted">
                  Created in the catalog and not yet received on any inward.
                </p>
              )}
            </CardBody>
          </Card>

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
                        </td>
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
