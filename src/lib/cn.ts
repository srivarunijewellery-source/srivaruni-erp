/** Minimal class combiner. Deliberately not a dependency: this is the
 *  entire useful surface of clsx for our purposes. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
