import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { listCouponBatches } from "@/features/coupons/queries";
import { couponTerms } from "@/features/coupons/CouponTerms";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Coupons" };

export default async function CouponsPage() {
  const [user, batches] = await Promise.all([requireUser(), listCouponBatches()]);

  return (
    <>
      <PageHeader
        title="Coupons"
        description="Terms live on the batch; each coupon is one numbered instance of it."
        action={
          can(user, "discount.manage") && (
            <Link href={ROUTES.couponNew}>
              <Button variant="primary">Generate coupons</Button>
            </Link>
          )
        }
      />

      {batches.length === 0 ? (
        <EmptyState
          title="No coupons yet"
          hint="Generate a batch and the codes appear here, ready to hand out."
        />
      ) : (
        <div className="space-y-3">
          {batches.map((b) => (
            <Card key={b.id}>
              <CardBody>
                <Link href={ROUTES.couponBatch(b.id)} className="block">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{b.name}</p>
                      <p className="text-sm text-text-muted">{couponTerms(b)}</p>
                    </div>
                    <Badge tone={b.expired ? "neutral" : b.live ? "done" : "pending"}>
                      {b.expired ? "Expired" : b.live ? "Live" : "Scheduled"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-text-muted">
                    <span className="font-mono">{b.prefix}-…</span>
                    <span>
                      {formatDate(b.validFrom)} &ndash; {formatDate(b.validTo)}
                    </span>
                    <span className="tnum">{b.available} available</span>
                    <span className="tnum">{b.assigned} assigned</span>
                    {b.redeemed > 0 && <span className="tnum">{b.redeemed} redeemed</span>}
                    {b.voided > 0 && <span className="tnum">{b.voided} void</span>}
                  </div>
                </Link>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
