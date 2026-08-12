/**
 * Shared between the server actions and the client grid, so neither
 * pulls the other's module into the wrong bundle.
 */

export interface PivotFilters {
  stages: string[];
  categories: string[];
  styles: string[];
  fromLocation: string;
  toLocation: string;
  /** Cells holding at least this many pieces. */
  minQty: number | null;
}

export interface PivotCell {
  category: string;
  style: string;
  items: number;
  pieces: number;
  retailPaise: number;
  /** On the shelf at the origin store — the denominator that makes the
   *  movement figure mean something. */
  onHand: number;
}

/** A piece on the shelf with nothing committed against it. */
export interface FreeItem {
  itemId: string;
  barcode: string;
  name: string;
  category: string;
  style: string;
  photoPath: string | null;
  sellingPricePaise: number;
  qty: number;
  locationCode: string;
}

export interface PivotItem {
  itemId: string;
  barcode: string;
  name: string;
  category: string;
  style: string;
  photoPath: string | null;
  sellingPricePaise: number;
  qty: number;
  stage: string;
  docNo: string;
  fromCode: string;
  toCode: string;
}

export const STAGES = [
  { key: "requested", label: "Requested" },
  { key: "picking", label: "Being picked" },
  { key: "picked", label: "Picked" },
  { key: "approved", label: "Approved" },
  { key: "dispatched", label: "In transit" },
] as const;
