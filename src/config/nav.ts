import type { Capability } from "@/config/roles";

/** Every route in one place. No string literals in components. */
export const ROUTES = {
  login: "/login",
  dashboard: "/",
  inward: "/inward",
  inwardNew: "/inward/new",
  inwardDetail: (id: string) => `/inward/${id}`,
  transfers: "/transfers",
  transferNew: "/transfers/new",
  transferDetail: (id: string) => `/transfers/${id}`,
  transferSlip: (id: string) => `/transfers/${id}/slip`,
  transit: "/transfers/transit",
  stock: "/stock",
  products: "/products",
  vendors: "/vendors",
  vendorDetail: (id: string) => `/vendors/${id}`,
  productDetail: (id: string) => `/products/${id}`,
  payments: "/payments",
  adjustments: "/adjustments",
  pricing: "/pricing",
  pricingRules: "/pricing/rules",
  pricingSettings: "/pricing/settings",
  discounts: "/discounts",
  discountSettings: "/discounts/settings",
} as const;

export interface NavItem {
  href: string;
  label: string;
  /** Hidden unless the user holds this capability. */
  requires?: Capability;
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
    label: "Purchases",
    items: [
      { href: ROUTES.inward,   label: "Inward" },
      { href: ROUTES.vendors,  label: "Vendors",  requires: "vendor.view" },
      { href: ROUTES.payments, label: "Payments", requires: "inward.viewCost" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: ROUTES.stock,       label: "Stock" },
      { href: ROUTES.products,    label: "Products" },
      { href: ROUTES.transfers,   label: "Transfers" },
      { href: ROUTES.transit,     label: "In transit" },
      { href: ROUTES.adjustments, label: "Adjustments" },
    ],
  },
  {
    label: "Pricing",
    items: [
      { href: ROUTES.pricing,          label: "Price stock",      requires: "pricing.manage" },
      { href: ROUTES.pricingRules,     label: "Rules",            requires: "pricing.manage" },
      { href: ROUTES.pricingSettings,  label: "Pricing settings", requires: "pricing.manage" },
      { href: ROUTES.discounts,        label: "Discounts",        requires: "discount.manage" },
      { href: ROUTES.discountSettings, label: "Discount settings", requires: "discount.manage" },
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
  { href: ROUTES.payments,  label: "Payments", requires: "inward.viewCost" },
  { href: ROUTES.pricing,   label: "Pricing", requires: "pricing.manage" },
  { href: ROUTES.discounts, label: "Discounts", requires: "discount.manage" },
] as const;
