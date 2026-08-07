import { NextResponse, type NextRequest } from "next/server";
import { listOpenBills } from "@/features/payments/queries";
import { getCurrentUser } from "@/features/auth/session";
import { can } from "@/config/roles";

/** Open bills for the payment form's allocation list. Owner-only, and
 *  RLS would return nothing to anyone else regardless. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !can(user, "cost.view")) {
    return NextResponse.json([], { status: 403 });
  }

  const vendorId = request.nextUrl.searchParams.get("vendorId");
  if (!vendorId) return NextResponse.json([]);

  return NextResponse.json(await listOpenBills(vendorId));
}
