/** Shared so neither the server query nor the client grid drags the
 *  other's module into the wrong bundle. */
export type PriceIssue = "thin" | "off_style";

export interface PriceCheckRow {
  issue: PriceIssue;
  itemId: string;
  barcode: string;
  name: string;
  category: string;
  style: string;
  photoPath: string | null;
  costPaise: number;
  sellingPaise: number;
  mrpPaise: number | null;
  markup: number;
  categoryMedian: number | null;
  suggestedPaise: number | null;
  onHand: number;
  detail: string;
}

export const ISSUE_LABEL: Record<PriceIssue, string> = {
  thin: "Thin margin",
  off_style: "Out of step",
};
