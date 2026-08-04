import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { getCouponBatch, listCoupons } from "@/features/coupons/queries";
import { couponTerms } from "@/features/coupons/CouponTerms";
import { CouponRow } from "@/features/coupons/CouponRow";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Coupon batch" };

export default async function CouponBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ id }, { status = "" }, user] = await Promise.all([
    params,
    searchParams,
    requireUser(),
  ]);
  const batch = await getCouponBatch(id);
  if (!batch) notFound();

  const all = await listCoupons(id);
  const coupons = status ? all.filter((c) => c.status === status) : all;
  const canVoid = can(user, "discount.manage");

  const filters = [
    ["", `All ${batch.total}`],
    ["available", `Available ${batch.available}`],
    ["assigned", `Assigned ${batch.assigned}`],
    ["redeemed", `Redeemed ${batch.redeemed}`],
    ["void", `Void ${batch.voided}`],
  ] as const;

  return (
    <>
      <PageHeader
        title={batch.name}
        description={couponTerms(batch)}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={batch.expired ? "neutral" : batch.live ? "done" : "pending"}>
              {batch.expired ? "Expired" : batch.live ? "Live" : "Scheduled"}
            </Badge>
            <Link href={ROUTES.coupons}>
              <Button size="sm" variant="ghost">
                All coupons
              </Button>
            </Link>
          </div>
        }
      />

      <Card className="mb-4">
        <CardBody className="grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-2xs uppercase tracking-wide text-text-muted">Valid</p>
            <p>
              {formatDate(batch.validFrom)} &ndash; {formatDate(batch.validTo)}
            </p>
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-text-muted">Prefix</p>
            <p className="font-mono">{batch.prefix}</p>
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-text-muted">Issued</p>
            <p className="tnum font-mono">{batch.total}</p>
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-text-muted">Notes</p>
            <p>{batch.notes || "—"}</p>
          </div>
        </CardBody>
      </Card>

      <div className="mb-3 flex flex-wrap gap-2">
        {filters.map(([value, label]) => (
          <Link key={value || "all"} href={value ? `${ROUTES.couponBatch(id)}?status=${value}` : ROUTES.couponBatch(id)}>
            <Button size="sm" variant={status === value ? "primary" : "secondary"}>
              {label}
            </Button>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <span className="font-medium">Codes</span>
        </CardHeader>
        <CardBody className="py-0">
          {coupons.length === 0 ? (
            <p className="py-4 text-sm text-text-muted">Nothing in this state.</p>
          ) : (
            <ul className="divide-y divide-border">
              {coupons.map((c) => (
                <CouponRow key={c.id} coupon={c} batchId={id} canVoid={canVoid} />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
