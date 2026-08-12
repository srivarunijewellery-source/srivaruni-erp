/**
 * Types and labels shared by the reconciliation server queries and the
 * client board.
 *
 * Kept in their own module with no imports, because
 * ReconciliationBoard is a client component: importing ISSUE_LABEL from
 * queries.ts pulled that whole file into the browser bundle, and with it
 * `next/headers` via the Supabase server client. Type-only imports are
 * erased at compile time and would have been fine — it was the one real
 * value that broke the build.
 */

export type ReconIssue =
  | "negative"
  | "short_received"
  | "sold_while_committed"
  | "priced_no_cost";

export interface ReconRow {
  issue: ReconIssue;
  itemId: string;
  barcode: string;
  itemName: string;
  locationCode: string | null;
  onHand: number;
  committed: number;
  delta: number;
  detail: string;
  lastMoved: string | null;
}

export interface LedgerEntry {
  at: string;
  qtyDelta: number;
  reason: string;
  refType: string | null;
  docNo: string | null;
  runningQty: number;
}

export const ISSUE_LABEL: Record<ReconIssue, string> = {
  negative: "Below zero",
  short_received: "Short on arrival",
  sold_while_committed: "Sold while committed",
  priced_no_cost: "Priced with no cost",
};
