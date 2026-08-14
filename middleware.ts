import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except Next internals, static assets, and public routes.
    // /privacy must stay public (Meta app review reads it).
    // /api/whatsapp is the Meta webhook (verified by hub token, not session auth).
    "/((?!_next/static|_next/image|favicon.ico|privacy|api/whatsapp|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
