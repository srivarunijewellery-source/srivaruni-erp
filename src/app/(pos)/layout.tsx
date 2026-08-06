import Link from "next/link";
import { resolveSession } from "@/features/auth/session";
import { ROUTES } from "@/config/nav";

/**
 * The counter gets its own shell, deliberately empty.
 *
 * Billing is the one screen someone stands at for eight hours, and the
 * grouped app navigation above it was both a distraction and a hazard:
 * every menu is a way to leave a half-rung bill by accident. Here there
 * is no navigation at all. Getting out is a deliberate act, and the
 * counter is opened in its own tab from the rest of the app so the
 * office work someone was doing is still sitting where they left it.
 *
 * Auth is repeated rather than shared with (app): a route group has no
 * parent layout to inherit from, and the counter must never render for
 * a session that has expired.
 */
export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const session = await resolveSession();

  if (session.status !== "ok") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
        <div className="w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-card">
          <p className="font-mono text-2xs uppercase tracking-widest text-text-subtle">
            Sri Varuni
          </p>
          <h1 className="mt-2 text-lg font-semibold">The counter is locked</h1>
          <p className="mt-2 text-sm text-text-muted">
            {session.status === "no-session"
              ? "This device is not signed in, or the session expired. Sign in again to keep billing."
              : session.status === "no-staff-record"
                ? "This login is not linked to a staff member yet. Ask the owner to add you."
                : session.message}
          </p>
          <Link
            href={ROUTES.login}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-control bg-brand px-4 text-sm font-medium text-brand-fg hover:bg-brand-hover"
          >
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  return <div className="min-h-dvh bg-bg">{children}</div>;
}
