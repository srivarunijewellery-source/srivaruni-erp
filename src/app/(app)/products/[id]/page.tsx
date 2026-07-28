import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { getProduct } from "@/features/products/queries";
import {
  listCategories,
  listItemFormOptions,
  listStores,
} from "@/features/inward/queries";
import { QtyAdjuster } from "@/features/products/QtyAdjuster";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { ProductDetailCard } from "@/features/products/ProductDetailCard";
import { itemPhotoUrl } from "@/lib/storage";
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

  const [product, categories, options, stores] = await Promise.all([
    getProduct(id),
    listCategories(),
    listItemFormOptions(),
    listStores(),
  ]);

  if (!product) notFound();

  const canEditPricing = can(user.role, "inward.viewCost");

  return (
    <>
      <PageHeader
        title={product.name}
        description={`${product.barcode} · ${product.categoryName}`}
        action={
          <div className="flex items-center gap-3">
            <Badge tone={STATUS_TONE[product.status]}>{product.status}</Badge>
            <Link href={ROUTES.products} className="text-sm text-brand hover:underline">
              All products
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <h2 className="font-medium">Photos</h2>
            </CardHeader>
            <CardBody>
              {product.photos.length === 0 ? (
                <p className="text-sm text-text-muted">
                  No photos. Images are captured when the item is added to an inward.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {product.photos.map((p) => (
                    <PhotoThumb
                      key={p.id}
                      src={itemPhotoUrl(p.path)}
                      alt={product.name}
                      size={88}
                    />
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

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
        </div>

        <div className="lg:col-span-2">
          <ProductDetailCard
            product={product}
            categories={categories}
            options={options}
            canEditPricing={canEditPricing}
          />
        </div>
      </div>
    </>
  );
}
