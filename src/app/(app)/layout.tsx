import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveSession } from "@/features/auth/session";
import { AppNav } from "@/components/AppNav";
import { ROUTES } from "@/config/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await resolveSession();

  // Nobody signed in? Send them to sign in. Showing a panel that says
  // "your session ended" to someone who simply opened the app is a wall
  // with a door behind it -- the only useful action is the redirect, so
  // just do the redirect.
  if (session.status === "no-session") {
    redirect(ROUTES.login);
  }

  // Everything else IS worth reading: no staff record, or a genuine
  // failure. Rendered, not thrown -- Next.js strips thrown error
  // messages from production Server Component builds, which turns each
  // of these into an opaque digest.
  if (session.status !== "ok") {
    return <SessionProblem session={session} />;
  }

  return (
    <div className="min-h-dvh">
      <AppNav user={session.user} />
      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>

      {/* A maker's mark, not a credit roll. Bottom right, faint, no
          rule above it — there if you look, invisible if you are working. */}
      <footer className="mx-auto w-full max-w-6xl px-4 pb-6">
        <p
          className="text-right text-2xs italic text-text-subtle/60"
          title="Conceptualised, designed and developed by Satwik Beernelly with Claude"
        >
          SB × Claude
        </p>
      </footer>
    </div>
  );
}

function SessionProblem({
  session,
}: {
  session: Exclude<Awaited<ReturnType<typeof resolveSession>>, { status: "ok" }>;
}) {
  const { title, detail, action } = describe(session);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-card">
        <p className="font-mono text-2xs uppercase tracking-widest text-text-subtle">
          Sri Varuni
        </p>
        <h1 className="mt-2 text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-text-muted">{detail}</p>
        {action}
      </div>
    </main>
  );
}

function describe(
  session: Exclude<Awaited<ReturnType<typeof resolveSession>>, { status: "ok" }>,
) {
  const signIn = (
    <Link
      href={ROUTES.login}
      className="mt-4 inline-flex h-10 items-center justify-center rounded-control bg-brand px-4 text-sm font-medium text-brand-fg hover:bg-brand-hover"
    >
      Go to sign in
    </Link>
  );

  switch (session.status) {
    case "no-session":
      return {
        title: "Your session ended",
        detail:
          "You are not signed in on this device, or the session expired. Sign in again to continue.",
        action: signIn,
      };
    case "no-staff-record":
      return {
        title: "No staff record for this login",
        detail: `You are signed in as ${session.email ?? session.authUserId}, but that login is not linked to a staff member yet. Ask the owner to add you, then sign in again.`,
        action: signIn,
      };
    case "error":
      return {
        title: "Could not load your account",
        detail: session.message,
        action: signIn,
      };
  }
}
