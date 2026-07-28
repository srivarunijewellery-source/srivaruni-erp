import { NextResponse, type NextRequest } from "next/server";
import { searchAttachableItems } from "@/features/inward/queries";
import { getCurrentUser } from "@/features/auth/session";

/** Search box behind "Add existing item" on an inward document. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json([], { status: 403 });

  const term = request.nextUrl.searchParams.get("q") ?? "";
  return NextResponse.json(await searchAttachableItems(term));
}
