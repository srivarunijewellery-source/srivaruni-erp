/**
 * Server actions return a Result rather than throwing.
 *
 * Database errors here are frequently AUTHORIZATION errors raised inside
 * SECURITY DEFINER functions ("Only the owner can approve an inward").
 * Those messages are written for the person reading them, so they are
 * surfaced rather than replaced with a generic failure.
 */
export type Result<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = (error: string): Result<never> => ({ ok: false, error });

/** Postgres raises arrive with noise around the message we wrote. */
export function toMessage(e: unknown, fallback = "Something went wrong."): string {
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = String((e as { message: unknown }).message);
    return m.replace(/^.*?ERROR:\s*/i, "").trim() || fallback;
  }
  return fallback;
}
