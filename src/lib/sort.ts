/**
 * One ordering for every item list in the app.
 *
 * Barcodes are issued in sequence and zero padded, so descending
 * barcode IS descending order of creation -- and unlike created_at it
 * survives the migration, which stamped several thousand pieces with
 * the import date rather than the date they were actually received.
 *
 * It is also unique, which is what makes it safe to page on: sorting a
 * paged list by a non-unique key (a name, a timestamp shared across an
 * inward) leaves ties in undefined order, and a row can then appear on
 * two pages or on neither.
 *
 * Queries that can order in the database do so with
 * .order("barcode", { ascending: false }); this is for lists already in
 * memory. Deliberately a plain text comparison -- no locale, no numeric
 * collation -- because Postgres is doing a plain text sort at the other
 * end, and a cleverer comparator here would quietly disagree with it.
 */

/** Sorts an in-memory list newest barcode first. */
export function byBarcodeDesc(
  a: { barcode?: string | null },
  b: { barcode?: string | null },
): number {
  const x = a.barcode ?? "";
  const y = b.barcode ?? "";
  if (x === y) return 0;
  return x < y ? 1 : -1;
}
