import type { Metadata } from "next";
import { APP } from "@/config/app";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

/**
 * The sign-in screen.
 *
 * A split: the house on the left, the form on the right. The left panel
 * is deep maroon rather than the SaaS blue everyone else uses — this is
 * a jewellery business, and the sign-in screen is the one part of the
 * system a shop owner sees before they see anything else.
 *
 * Deliberately no vanity statistics. "17,000 businesses" is a vendor
 * selling to strangers; this system has one customer, who owns it, and
 * telling them their own branch count on a login screen would be
 * theatre. The left panel says what the system is for instead.
 *
 * It collapses entirely below `lg`: on a phone at the counter the form
 * should be the first thing under the thumb, not below a hero.
 */
export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Left: the house. Hidden on small screens. */}
      <section className="relative hidden overflow-hidden bg-brand px-12 py-14 text-brand-fg lg:flex lg:flex-col lg:justify-between">
        <BackdropLotus />

        <div className="relative">
          <p className="font-mono text-2xs uppercase tracking-[0.35em] opacity-70">
            {APP.shortName}
          </p>
          <p className="mt-2 text-lg tracking-[0.2em]">{APP.name.toUpperCase()}</p>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold leading-[1.1] tracking-tight">
            Every piece
            <br />
            <span className="opacity-70">accounted for.</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed opacity-80">
            Inward, pricing, the counter and the books — one system, so the
            tray, the tag and the ledger agree.
          </p>
        </div>

        <div className="relative flex gap-10">
          <Fact k="Boduppal" v="and every branch after it" />
          <Fact k="Offline first" v="the counter never stops" />
        </div>
      </section>

      {/* Right: the form, vertically centred and narrow. */}
      <section className="flex items-center justify-center bg-bg px-6 py-12">
        <div className="w-full max-w-sm">
          {/* The mark repeats here because on a phone the left panel is
              gone and this would otherwise be an unlabelled login box. */}
          <div className="mb-8 lg:hidden">
            <p className="font-mono text-2xs uppercase tracking-[0.3em] text-text-subtle">
              {APP.shortName}
            </p>
            <p className="mt-1 text-lg tracking-[0.2em] text-brand">
              {APP.name.toUpperCase()}
            </p>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-text-muted">
            Sign in to the counter and the books.
          </p>

          <div className="mt-6">
            <LoginForm />
          </div>

          <p className="mt-8 text-2xs text-text-subtle">
            Trouble signing in? Ask the owner to check your staff record.
          </p>

          <p
            className="mt-10 text-2xs italic text-text-subtle/60"
            title="Conceptualised, designed and developed by Satwik Beernelly with Claude"
          >
            SB × Claude
          </p>
        </div>
      </section>
    </main>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-sm font-medium">{k}</p>
      <p className="mt-0.5 text-2xs opacity-70">{v}</p>
    </div>
  );
}

/**
 * A lotus, drawn very faintly behind the panel.
 *
 * The brand emblem, at low contrast and large scale, so it reads as
 * texture rather than a logo pasted on. Pure SVG: no asset to load, no
 * flash while it arrives, and it scales to any panel size.
 */
function BackdropLotus() {
  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-20 -right-16 h-[26rem] w-[26rem] opacity-[0.07]"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <ellipse
          key={i}
          cx="100"
          cy="60"
          rx="17"
          ry="46"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          transform={`rotate(${i * 45} 100 100)`}
        />
      ))}
      <circle cx="100" cy="100" r="9" fill="currentColor" />
    </svg>
  );
}
