import type { Capability } from "@/config/roles";

/** Every route in one place. No string literals in components. */
export const ROUTES = {
  login: "/login",
  dashboard: "/",
  inward: "/inward",
  assembly: "/assembly",
  assemblyDetail: (id: string) => `/assembly/${id}`,
  inwardNew: "/inward/new",
  inwardDetail: (id: string) => `/inward/${id}`,
  transfers: "/transfers",
  transferMovement: "/transfers/movement",
  transferNotPicked: "/transfers/not-picked",
  transferNew: "/transfers/new",
  transferDetail: (id: string) => `/transfers/${id}`,
  transferSlip: (id: string) => `/transfers/${id}/slip`,
  transit: "/transfers/transit",
  stock: "/stock",
  stockReconcile: "/stock/reconcile",
  audits: "/stock/audit",
  display: "/display",
  auditDetail: (id: string) => `/stock/audit/${id}`,
  priceCheck: "/pricing/check",
  products: "/products",
  vendors: "/vendors",
  customers: "/customers",
  customerDetail: (id: string) => `/customers/${id}`,
  vendorDetail: (id: string) => `/vendors/${id}`,
  productDetail: (id: string) => `/products/${id}`,
  payments: "/payments",
  adjustments: "/adjustments",
  pricing: "/pricing",
  pricingRules: "/pricing/rules",
  pricingSettings: "/pricing/settings",
  discounts: "/discounts",
  discountSettings: "/discounts/settings",
  barcodes: "/utilities/barcodes",
  logs: "/utilities/logs",
  gifts: "/crm/gifts",
  coupons: "/coupons",
  couponNew: "/coupons/new",
  couponBatch: (id: string) => `/coupons/${id}`,
  staff: "/team/staff",
  staffDetail: (id: string) => `/team/staff/${id}`,
  attendance: "/team/attendance",
  leave: "/team/leave",
  performance: "/team/performance",
  comms: "/comms",
  commsSettings: "/comms/settings",
  whatsapp: "/comms/whatsapp",
  roles: "/team/roles",
  insights: "/dashboard",
  settings: "/settings",
  masters: "/settings/masters",
  printSettings: "/settings/print",
  company: "/settings/company",
  pos: "/pos",
  sales: "/sales",
  salesDetail: "/sales/detail",
  returns: "/returns",
  feedback: "/feedback",
  billDetail: (id: string) => `/sales/${id}`,
  reports: "/reports",
  financeSummary: "/accounts/summary",
  bankInbox: "/accounts/bank-inbox",
  expenses: "/accounts/expenses",
  journals: "/accounts/journals",
  trialBalance: "/accounts/trial-balance",
  pnl: "/accounts/pnl",
  accounts: "/accounts/chart",
  taxRates: "/accounts/tax",
  gst: "/accounts/gst",
  accountStatement: (id: string) => `/accounts/statement/${id}`,
} as const;

export interface NavItem {
  href: string;
  label: string;
  /** Hidden unless the user holds this capability. */
  requires?: Capability;
  /** Opens in a new tab. The counter does, so office work is not lost
   *  every time someone goes to ring a sale. */
  newTab?: boolean;
}

/**
 * Grouped navigation.
 *
 * The flat bar was already at ten items and every module adds more, so it
 * was heading for a scrolling strip nobody can scan. Grouping is by the
 * question being asked — what did we buy, what do we hold, what do we
 * charge for it — rather than by which table the page happens to read.
 *
 * A group disappears when the role holds none of its capabilities, so a
 * staff member never sees an empty menu. Groups with no items yet
 * (Customers, until the CRM exists) are simply left out.
 */
export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    // The counter first, because it is the only group opened every day
    // by everyone. Billing stays at the top of it for the same reason.
    // Notes sits here rather than under CRM: it is filled in at the
    // till, by the person who heard the thing.
    label: "Counter",
    items: [
      { href: ROUTES.pos,         label: "Billing",   requires: "pos.sell", newTab: true },
      { href: ROUTES.sales,       label: "Sales",     requires: "stock.view" },
      { href: ROUTES.returns,     label: "Returns",   requires: "stock.view" },
      { href: ROUTES.feedback,    label: "Notes and requirements", requires: "stock.view" },
      { href: ROUTES.insights,    label: "Dashboard", requires: "accounts.view" },
      { href: ROUTES.salesDetail, label: "Sales detail", requires: "cost.view" },
    ],
  },
  {
    // Split from the old nine-item Inventory list, which had counting,
    // moving and pricing questions all in one column. This one answers
    // "what do we hold".
    label: "Stock",
    items: [
      { href: ROUTES.stock,          label: "Stock on hand" },
      { href: ROUTES.products,       label: "Products" },
      { href: ROUTES.audits,         label: "Stock audit",  requires: "transfer.approve" },
      { href: ROUTES.display,        label: "Display" },
      { href: ROUTES.adjustments,    label: "Adjustments" },
      { href: ROUTES.stockReconcile, label: "Reconcile",    requires: "cost.view" },
      { href: ROUTES.barcodes,       label: "Barcode labels" },
    ],
  },
  {
    // ...and this one answers "where is it". Four transfer pages sat
    // among the stock pages and were hard to tell apart at a glance.
    label: "Transfers",
    items: [
      { href: ROUTES.transfers,         label: "Transfers" },
      { href: ROUTES.transferMovement,  label: "What is moving" },
      { href: ROUTES.transferNotPicked, label: "Not packed" },
      { href: ROUTES.transit,           label: "In transit" },
    ],
  },
  {
    label: "Purchases",
    items: [
      { href: ROUTES.inward,   label: "Inward" },
      { href: ROUTES.assembly, label: "Assembly" },
      { href: ROUTES.vendors,  label: "Vendors",  requires: "vendor.view" },
      { href: ROUTES.payments, label: "Payments", requires: "cost.view" },
    ],
  },
  {
    // Price check moved here from Inventory: it is a pricing question
    // wearing a stock page, and nobody looking for it thought to open
    // the stock menu.
    label: "Pricing",
    items: [
      { href: ROUTES.pricing,         label: "Price stock",      requires: "pricing.manage" },
      { href: ROUTES.priceCheck,      label: "Price check",      requires: "cost.view" },
      { href: ROUTES.pricingRules,    label: "Rules",            requires: "pricing.manage" },
      { href: ROUTES.pricingSettings, label: "Pricing settings", requires: "pricing.manage" },
    ],
  },
  {
    // Everything customer-facing: who they are, and every benefit that
    // can be offered to them. Discount SETTINGS moved out to Settings
    // with the rest of the settings pages; what is left here is the day
    // to day.
    label: "CRM",
    items: [
      { href: ROUTES.customers, label: "Customers" },
      { href: ROUTES.coupons,   label: "Coupons" },
      { href: ROUTES.gifts,     label: "Gift offers", requires: "discount.manage" },
      { href: ROUTES.discounts, label: "Discounts",   requires: "discount.manage" },
    ],
  },
  {
    // Financial summary first: it is the page opened to answer "how are
    // we doing". The ledger pages below are reached when a specific
    // question comes up, and the two configuration pages are last
    // because they are touched once a year.
    label: "Accounts",
    items: [
      { href: ROUTES.financeSummary, label: "Financial summary", requires: "accounts.view" },
      { href: ROUTES.reports,        label: "Reports",           requires: "accounts.view" },
      { href: ROUTES.expenses,       label: "Expenses",          requires: "accounts.manage" },
      { href: ROUTES.bankInbox,      label: "Bank alerts",       requires: "accounts.manage" },
      { href: ROUTES.pnl,            label: "Profit and loss",   requires: "accounts.view" },
      { href: ROUTES.gst,            label: "GST summary",       requires: "accounts.view" },
      { href: ROUTES.journals,       label: "Journal",           requires: "accounts.view" },
      { href: ROUTES.trialBalance,   label: "Trial balance",     requires: "accounts.view" },
      { href: ROUTES.accounts,       label: "Chart of accounts", requires: "accounts.manage" },
      { href: ROUTES.taxRates,       label: "Tax rates",         requires: "accounts.manage" },
    ],
  },
  {
    // Attendance sits beside the people it is about, and performance
    // reads bills rather than living under Pricing, because the
    // question it answers is "how is this person doing", not "what do
    // we charge".
    label: "Team",
    items: [
      { href: ROUTES.staff,       label: "Staff",       requires: "staff.view" },
      { href: ROUTES.attendance,  label: "Attendance",  requires: "attendance.mark" },
      { href: ROUTES.leave,       label: "Leave",       requires: "staff.view" },
      { href: ROUTES.performance, label: "Performance", requires: "staff.manage" },
    ],
  },
  {
    // Barcode labels moved to Stock, where the person printing them is
    // already working. What is left here is genuinely miscellaneous.
    label: "Utilities",
    items: [
      { href: ROUTES.comms, label: "Messages",     requires: "comms.view" },
      { href: ROUTES.logs,  label: "Activity log" },
    ],
  },
  {
    // The individual settings pages still live beside the modules they
    // configure; this group is the front door to all of them, because
    // "where do I change that" had no answer short of already knowing.
    label: "Settings",
    items: [
      { href: ROUTES.settings,         label: "All settings" },
      { href: ROUTES.company,          label: "Company",                requires: "settings.manage" },
      { href: ROUTES.masters,          label: "Categories & attributes", requires: "catalog.manage" },
      { href: ROUTES.printSettings,    label: "Print configuration",    requires: "settings.manage" },
      { href: ROUTES.roles,            label: "Roles",                  requires: "roles.manage" },
      { href: ROUTES.pricingSettings,  label: "Pricing settings",       requires: "pricing.manage" },
      { href: ROUTES.discountSettings, label: "Discount settings",      requires: "discount.manage" },
      { href: ROUTES.commsSettings,    label: "Comms settings",         requires: "comms.manage" },
      { href: ROUTES.whatsapp,         label: "WhatsApp",               requires: "comms.manage" },
    ],
  },
] as const;

/** Kept for anything still reading the flat list. */
export const NAV: readonly NavItem[] = [
  { href: ROUTES.dashboard, label: "Today" },
  { href: ROUTES.inward,    label: "Inward" },
  { href: ROUTES.transfers, label: "Transfers" },
  { href: ROUTES.stock,     label: "Stock" },
  { href: ROUTES.adjustments, label: "Adjustments" },
  { href: ROUTES.products,  label: "Products" },
  { href: ROUTES.vendors,   label: "Vendors", requires: "vendor.view" },
  { href: ROUTES.payments,  label: "Payments", requires: "cost.view" },
  { href: ROUTES.pricing,   label: "Pricing", requires: "pricing.manage" },
  { href: ROUTES.discounts, label: "Discounts", requires: "discount.manage" },
] as const;
