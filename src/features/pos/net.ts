"use client";

import type { Result } from "@/lib/result";

/**
 * Calling a server action is a network request that can THROW.
 *
 * Every action in this app returns a Result rather than throwing, which
 * made it easy to forget that the Result only exists once the request
 * has come back. When the Wi-Fi is down the call rejects before any
 * action code runs, so `const r = await someAction()` throws and the
 * surrounding handler simply stops — no error state, no fallback, no
 * message. At the counter that looked like tapping a button and having
 * nothing at all happen.
 *
 * This turns that rejection into an ordinary failed Result carrying an
 * `offline` flag, so callers can tell "the shop's internet is down" from
 * "the database said no", and fall back to the local queue only in the
 * first case.
 */
export type Attempt<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; offline: boolean };

/**
 * A rejected server action does not tell us plainly that the network is
 * the problem, so this reads the shapes browsers actually produce.
 *
 * Deliberately broad: treating a genuine server error as offline costs a
 * sale sitting safely in the queue for a few seconds until the drain
 * retries. Treating an offline moment as a server error costs the sale
 * entirely. The asymmetry decides the default.
 */
export function looksOffline(e: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (e instanceof TypeError) return true; // fetch's own failure mode

  const msg =
    typeof e === "object" && e !== null && "message" in e
      ? String((e as { message: unknown }).message).toLowerCase()
      : String(e ?? "").toLowerCase();

  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("err_internet") ||
    msg.includes("err_network") ||
    msg.includes("err_name_not_resolved") ||
    msg.includes("connection") ||
    msg.includes("timed out") ||
    msg.includes("timeout")
  );
}

/** Runs a server action, converting a thrown network failure into a Result. */
export async function attempt<T>(fn: () => Promise<Result<T>>): Promise<Attempt<T>> {
  try {
    const r = await fn();
    if (r.ok) return { ok: true, data: r.data };
    // The request reached the server and the server said no. Not offline.
    return { ok: false, error: r.error, offline: false };
  } catch (e) {
    const offline = looksOffline(e);
    return {
      ok: false,
      offline,
      error: offline
        ? "The connection dropped."
        : (e instanceof Error ? e.message : "Something went wrong."),
    };
  }
}

/**
 * Best-effort call for background refreshes.
 *
 * Drawer totals, credit balances and gift eligibility are all nice to
 * have and none of them should raise an error banner over a bill in
 * progress when the network blips. Returns null instead.
 */
export async function quietly<T>(fn: () => Promise<Result<T>>): Promise<T | null> {
  const r = await attempt(fn);
  return r.ok ? r.data : null;
}
