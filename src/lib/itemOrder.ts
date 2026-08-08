/**
 * One ordering for item codes, used everywhere a list of pieces is shown.
 *
 * The document view, the pricing screen and the label queue are three
 * views of the same carton, and the person using them is holding the
 * physical tray. If one is in code order and another is in entry order,
 * every line has to be hunted for twice. They previously disagreed:
 * the document sorted by code, pricing came back in line_no order, and
 * the label queue was in whatever order PostgREST happened to return.
 *
 * Numeric-aware, because these codes are a prefix plus a number: SV9
 * belongs before SV10, and a plain string sort puts it after SV100.
 * The collator is built once — constructing one per comparison is the
 * expensive part, and a sort calls the comparator O(n log n) times.
 */

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/** Compares two item codes. Blank codes sort last. */
export function compareItemCodes(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const ca = a ?? "";
  const cb = b ?? "";

  // A row with no code is the exception, not the starting point. Sorting
  // blanks first would push the lines that actually need attention below
  // the fold.
  if (ca === "" || cb === "") {
    if (ca === cb) return 0;
    return ca === "" ? 1 : -1;
  }

  return collator.compare(ca, cb);
}

/**
 * Comparator for an array of rows carrying an item code.
 *
 * `tiebreak` keeps the order deterministic when two lines share a code —
 * the same piece received twice on one document. Without it the order of
 * those two rows depends on the sort implementation, and the screen can
 * reshuffle them between renders for no visible reason.
 */
export function byItemCode<T>(
  code: (row: T) => string | null | undefined,
  tiebreak?: (row: T) => number,
): (a: T, b: T) => number {
  return (a, b) => {
    const byCode = compareItemCodes(code(a), code(b));
    if (byCode !== 0) return byCode;
    return tiebreak ? tiebreak(a) - tiebreak(b) : 0;
  };
}
