"use client";

/**
 * Root-segment error boundary.
 *
 * MUST live here, not inside (app)/. Next.js error boundaries do not
 * catch errors thrown by their OWN segment's layout.tsx — only by that
 * segment's children. requireUser() throws inside (app)/layout.tsx, so
 * the only boundary that can catch it is the one in the PARENT segment,
 * which is this file. Putting it in (app)/error.tsx (the first attempt)
 * silently did nothing, and Next.js fell through to its generic crash
 * page instead — exactly what showed up in production.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-6 text-center shadow-card">
        <p className="font-mono text-2xs uppercase tracking-widest text-text-subtle">
          Sri Varuni
        </p>
        <h1 className="mt-2 text-lg font-semibold">Can&apos;t open this yet</h1>
        <p className="mt-2 text-sm text-text-muted">{error.message}</p>
        <button
          onClick={reset}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-control bg-brand px-4 text-sm font-medium text-brand-fg hover:bg-brand-hover"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
