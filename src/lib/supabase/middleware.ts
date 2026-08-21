import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { env } from "@/lib/env";
import { ROUTES } from "@/config/nav";

/** Refreshes the auth session on every request and gates the app shell. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser(), not getSession(): getSession trusts the cookie without
  // revalidating it against the auth server.
  //
  // But it is a network call to Supabase Auth on EVERY request, and
  // Next prefetches links as they scroll into view -- each prefetch is
  // an .rsc request that runs this middleware and then renders, so two
  // auth calls per link. A products grid with sixty cards generated a
  // hundred-odd auth calls in seconds and Supabase started returning
  // 429s; the session then failed to resolve, the query ran as anon, and
  // staff saw "permission denied for function is_owner". Both faces of
  // one cause.
  //
  // A prefetch needs no gate. It renders a page nobody has navigated to,
  // and if the person does navigate, THAT request is gated properly. So
  // prefetches skip the check entirely, which removes the bulk of the
  // load without weakening anything a user can actually see.
  const isPrefetch =
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch" ||
    request.headers.get("x-purpose") === "prefetch";

  if (isPrefetch) return response;

  const { data: { user } } = await supabase.auth.getUser();

  const isLogin = request.nextUrl.pathname.startsWith(ROUTES.login);

  if (!user && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = ROUTES.login;
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = ROUTES.dashboard;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
