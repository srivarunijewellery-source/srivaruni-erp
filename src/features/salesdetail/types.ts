/** Shared so neither the server query nor the client grid pulls the
 *  other's module into the wrong bundle. */
export interface SalesLine {
  billId: string;
  billNo: string;
  billDate: string;
  locationCode: string;
  salesman: string;
  customerName: string | null;
  customerPhone: string | null;
  itemId: string;
  barcode: string;
  itemName: string;
  category: string;
  style: string;
  plating: string;
  vendor: string | null;
  qty: number;
  unitPricePaise: number;
  lineTotalPaise: number;
  /** Null when the viewer may not see cost. */
  costPaise: number | null;
  marginPaise: number | null;
  marginBps: number | null;
  totalRows: number;
}

export interface SalesBucket {
  bucket: string;
  lines: number;
  pieces: number;
  soldPaise: number;
  costPaise: number | null;
  marginPaise: number | null;
  marginBps: number | null;
  shareBps: number;
}

/** What the summary can be cut by. Each answers a different question,
 *  and none of them is derivable from the others once a bill spans
 *  several categories. */
export const GROUPINGS = [
  { key: "category", label: "Category" },
  { key: "salesman", label: "Salesman" },
  { key: "style", label: "Style" },
  { key: "branch", label: "Branch" },
  { key: "vendor", label: "Vendor" },
  { key: "item", label: "Item" },
] as const;
