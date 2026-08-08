/**
 * Application constants. Anything a reviewer might call a "magic value"
 * lives here with a name and a reason.
 */
export const APP = {
  name: "Sri Varuni",
  shortName: "SV",
  /** Full trading name, as it should appear on documents. */
  tagName: "Sri Varuni Fashion Jewellery",
  /** Split for the two-line brand band on price tags: house name large,
   *  category small beneath it. */
  tagBrandLine1: "SRI VARUNI",
  /**
   * Second brand line on the tag. Empty on purpose.
   *
   * At the size it had to print to fit the band, "FASHION JEWELLERY"
   * came out as an unreadable grey smear under the house name -- it was
   * costing contrast on the one line that does need to read across a
   * counter. Blank here makes the tag print the house name alone,
   * larger and centred. Put a string back and the two-line layout
   * returns automatically.
   */
  tagBrandLine2: "",
  /** Base currency. All money in the database is BIGINT paise. */
  currency: "INR",
  locale: "en-IN",
  /** Store timezone. The owner works from US Pacific; the shops do not,
   *  and a document stamped in Pacific time is a support ticket. */
  timeZone: "Asia/Kolkata",
} as const;

export const PAGINATION = {
  defaultPageSize: 50,
  maxPageSize: 200,
} as const;

export const INWARD = {
  /** An inward cannot be submitted without a photo of the vendor bill,
   *  because staff never enter rates and the photo is the only cost source. */
  requiresInvoicePhoto: true,
  /** Client-side compression target before upload. Phone photos are 4-6MB;
   *  this keeps an inward usable on shop-floor mobile data. */
  photoMaxEdgePx: 1600,
  photoQuality: 0.82,
} as const;

export const STORAGE_BUCKETS = {
  itemPhotos: "item-photos",
  inwardInvoices: "inward-invoices",
} as const;
