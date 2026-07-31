import { formatPaise } from "@/lib/money";
import type { CouponBatch } from "./queries";

/** The offer in one line, phrased the way it would be said out loud. */
export function couponTerms(b: CouponBatch): string {
  const off =
    b.discountKind === "percent"
      ? `${(b.discountBps ?? 0) / 100}% off`
      : `${formatPaise(b.discountPaise ?? 0)} off`;
  const min =
    b.minPurchasePaise > 0 ? ` on ${formatPaise(b.minPurchasePaise)} or more` : "";
  return `${off}${min}`;
}
