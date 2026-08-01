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
/**
 * Approval sits AFTER picking on purpose: the owner signs off on what is
 * physically in the box, not on what was optimistically requested.
 */
export type TransferStatus =
  | "requested" | "picking"  | "picked"
  | "approved"  | "dispatched"
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

/** One item on a transfer, carrying all four counts through the lifecycle. */
export interface TransferLine {
  id: string;
  itemId: string;
  barcode: string;
  name: string;
  category: string;
  photoPath: string | null;
  sellingPricePaise: Paise | null;
  /** What the destination asked for. Never changes after the request. */
  qtyRequested: number;
  /** What was physically found and scanned into the box. */
  qtyPicked: number;
  /** What was dispatched. Set from qtyPicked when the pick is confirmed. */
  qtySent: number;
  /** What was scanned in at the destination. Null until receipt. */
  qtyReceived: number | null;
  /** Stock available at the sending store, for the picker's reference. */
  qtyAvailable: number;
}

export interface TransferDetail {
  id: string;
  docNo: string;
  status: TransferStatus;
  fromLocationId: string;
  fromCode: string;
  fromName: string;
  toLocationId: string;
  toCode: string;
  toName: string;
  reason: string | null;
  note: string | null;
  pickNote: string | null;
  rejectedReason: string | null;
  courier: string | null;
  docketNo: string | null;
  requestedAt: string | null;
  pickedAt: string | null;
  approvedAt: string | null;
  dispatchedAt: string | null;
  receivedAt: string | null;
  lines: TransferLine[];
}

/**
 * A unit that has left the sending store and arrived nowhere.
 *
 * locationId is deliberately null. This stock belongs to no store, is not
 * sellable, and is excluded from stock_on_hand. It is a transient state
 * that nets to zero the moment the transfer is received.
 */
export interface TransitRow {
  transferId: string;
  docNo: string;
  itemId: string;
  barcode: string;
  itemName: string;
  category: string;
  photoPath: string | null;
  qty: number;
  sellingPricePaise: Paise | null;
  fromCode: string;
  toCode: string;
  courier: string | null;
  docketNo: string | null;
  dispatchedAt: string | null;
  daysInTransit: number;
}

/** One box currently on the road. */
export interface TransitBox {
  transferId: string;
  docNo: string;
  fromCode: string;
  toCode: string;
  lines: number;
  qtyInTransit: number;
  valuePaise: Paise;
  courier: string | null;
  docketNo: string | null;
  dispatchedAt: string | null;
  daysInTransit: number;
  overdue: boolean;
}

/** A candidate for the request screen's tile picker. */
export interface PickableItem {
  itemId: string;
  barcode: string;
  name: string;
  category: string;
  itemType: string | null;
  plating: string | null;
  photoPath: string | null;
  qtyAvailable: number;
  /** Days since stock of this item last moved into this store. Null if never. */
  ageDays: number | null;
  sellingPricePaise: Paise | null;
}

/** What the filter bar can offer, scoped to what a store actually holds. */
export interface StockFilterOptions {
  categories: string[];
  itemTypes: string[];
  platings: string[];
}

export interface StockRow {
  photoPath: string | null;
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
  /** The catalogue item, so a line can link straight to the product. */
  itemId: string;
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

/* ---------------------------------------------------------------------
   Pricing
   ------------------------------------------------------------------ */

export type VendorPricingMode = "code_multiple" | "serial_list" | "manual";

/** Margin bands are basis points on the tag price: 50-55% is 5000-5500. */
export interface PriceBand {
  id: string;
  label: string;
  loBps: number;
  hiBps: number;
}

export interface PricingRule {
  id: string;
  name: string;
  vendorId: string | null;
  vendorName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  itemTypeId: string | null;
  itemTypeName: string | null;
  bandId: string;
  bandLabel: string;
  specificity: number;
  active: boolean;
}

export interface PricingSettings {
  targetNudgeBps: number;
  roundMode: "nearest" | "up";
  gridSwitchPaise: Paise;
  highEndingPaise: number;
  lowEndingsPaise: number[];
  marginIncludesGst: boolean;
  defaultBandId: string | null;
}

/** What recommend_price() hands back. Every figure decided server-side. */
export interface PriceRecommendation {
  landedCostPaise: Paise;
  bandId: string;
  bandLabel: string;
  loBps: number;
  hiBps: number;
  targetBps: number;
  ruleId: string | null;
  ruleName: string | null;
  mrpMinPaise: Paise;
  mrpMaxPaise: Paise;
  idealMrpPaise: Paise;
  recommendedMrpPaise: Paise;
  achievedMarginBps: number;
  inBand: boolean;
}

/** Result of reading a design code out of a product title. */
export interface ParsedDesignCode {
  code: string;
  codeNumeric: number;
  dateDigits: string | null;
  parsedDate: string | null;
  /** Both a 7- and an 8-digit date suffix parsed, giving different codes. */
  ambiguous: boolean;
  altCode: string | null;
  altDate: string | null;
}

/* ---------------------------------------------------------------------
   Discounts
   ------------------------------------------------------------------ */

export type DiscountScope = "selection" | "invoice";
export type DiscountValueKind = "percent" | "amount";

export interface DiscountScheme {
  id: string;
  name: string;
  scope: DiscountScope;
  valueKind: DiscountValueKind;
  valueBps: number | null;
  valuePaise: Paise | null;
  startsOn: string;
  endsOn: string;
  active: boolean;
  priority: number;
  stackable: boolean;
  minBillPaise: Paise;
  maxDiscountPaise: Paise | null;
  locationIds: string[] | null;
  note: string | null;
  targets: DiscountTarget[];
}

export interface DiscountTarget {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  itemTypeId: string | null;
  itemTypeName: string | null;
  vendorId: string | null;
  vendorName: string | null;
  itemId: string | null;
  itemName: string | null;
}

export interface DiscountSettings {
  maxPercentStaffBps: number;
  maxPercentManagerBps: number;
  maxPercentOwnerBps: number;
  maxCampaignDays: number;
  allowStacking: boolean;
  neverBelowCost: boolean;
  minMarginBps: number;
  requireReasonAboveBps: number;
  requireApprovalAboveBps: number;
}

/** The shape resolve_discounts() returns. Mirrors the jsonb exactly. */
export interface DiscountResolution {
  as_of: string;
  role: Role;
  role_cap_bps: number;
  lines: Array<{
    idx: number;
    item_id: string;
    item_name: string;
    qty: number;
    unit_price_paise: Paise;
    gross_paise: Paise;
    scheme_id: string | null;
    scheme_name: string | null;
    discount_paise: Paise;
    net_paise: Paise;
    capped: boolean;
    /** The margin floor refused this discount, wholly or in part. */
    floor_blocked: boolean;
  }>;
  gross_paise: Paise;
  line_discount_paise: Paise;
  subtotal_paise: Paise;
  invoice_scheme_id: string | null;
  invoice_scheme_name: string | null;
  invoice_discount_paise: Paise;
  manual_discount_paise: Paise;
  manual_discount_bps: number;
  total_discount_paise: Paise;
  net_paise: Paise;
  effective_discount_bps: number;
  floor_headroom_paise: Paise;
  role_capped: boolean;
  requires_reason: boolean;
  requires_approval: boolean;
  notes: string[];
}
