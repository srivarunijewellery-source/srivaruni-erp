/**
 * Domain types.
 *
 * These mirror the Postgres enums and the shapes the app actually reads.
 * The full generated schema lives in `database.ts` (npm run db:types);
 * this file is the hand-curated surface the UI codes against, so a
 * schema regeneration never churns component code.
 */

export type Role = "owner" | "manager" | "staff";
export type InwardStatus = "draft" | "submitted" | "approved" | "rejected";
export type TransferStatus =
  | "requested" | "approved" | "dispatched"
  | "received"  | "rejected" | "cancelled";
export type ItemStatus = "pending_pricing" | "active" | "inactive" | "discontinued";
export type LocationKind = "store" | "transit" | "damage";
export type VendorGstStatus = "registered" | "composition" | "unregistered";

/** Money is always BIGINT paise in the database. Never a float, never rupees. */
export type Paise = number;

export interface CurrentUser {
  staffId: string;
  authUserId: string;
  name: string;
  role: Role;
  locationId: string | null;
  locationCode: string | null;
}

export interface StoreLocation {
  id: string;
  code: string;
  name: string;
  kind: LocationKind;
}

/** What the inward dropdown needs. Sourced from the vendor_picklist
 *  view, because the vendors table itself is manager-and-above. */
export interface VendorOption {
  id: string;
  name: string;
  city: string | null;
}

export interface Vendor {
  id: string;
  name: string;
  gstStatus: VendorGstStatus;
  gstin: string | null;
  city: string | null;
}

export interface Category {
  id: string;
  name: string;
  markupMultiplier: number;
}

export interface InwardSummary {
  id: string;
  docNo: string;
  status: InwardStatus;
  vendorName: string;
  locationCode: string;
  lineCount: number;
  totalQty: number;
  createdAt: string;
  submittedAt: string | null;
}

export interface TransferSummary {
  id: string;
  docNo: string;
  status: TransferStatus;
  fromCode: string;
  toCode: string;
  reason: string | null;
  lines: number;
  qtySent: number;
  qtyReceived: number;
  requestedAt: string | null;
  receivedAt: string | null;
}

export interface StockRow {
  itemId: string;
  barcode: string;
  name: string;
  category: string;
  locationCode: string;
  qty: number;
  sellingPricePaise: Paise | null;
}

export interface InwardLine {
  id: string;
  barcode: string;
  name: string;
  category: string;
  qty: number;
  qtyShort: number;
  /** Primary photo. The owner prices from these, so the document shows them. */
  photoPath: string | null;
}

export interface InwardDetail {
  id: string;
  docNo: string;
  status: InwardStatus;
  vendorName: string;
  locationCode: string;
  vendorId: string;
  vendorInvoiceNo: string | null;
  vendorInvoiceDate: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  lines: InwardLine[];
}

export interface AttributeOption {
  id: string;
  value: string;
}

export interface ItemTypeOption {
  id: string;
  categoryId: string;
  name: string;
}

/** Everything the add-item form needs, fetched once on the server. */
export interface ItemFormOptions {
  categories: Category[];
  itemTypes: ItemTypeOption[];
  colours: AttributeOption[];
  platings: AttributeOption[];
  stones: AttributeOption[];
  sizes: AttributeOption[];
}
