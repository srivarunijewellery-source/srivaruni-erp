import type { Capability } from "@/config/roles";

/** Every route in one place. No string literals in components. */
export const ROUTES = {
  login: "/login",
  dashboard: "/",
  inward: "/inward",
  inwardNew: "/inward/new",
  inwardDetail: (id: string) => `/inward/${id}`,
  transfers: "/transfers",
  transferDetail: (id: string) => `/transfers/${id}`,
  stock: "/stock",
  products: "/products",
  vendors: "/vendors",
} as const;

export interface NavItem {
  href: string;
  label: string;
  /** Hidden unless the user holds this capability. */
  requires?: Capability;
}

export const NAV: readonly NavItem[] = [
  { href: ROUTES.dashboard, label: "Today" },
  { href: ROUTES.inward,    label: "Inward" },
  { href: ROUTES.transfers, label: "Transfers" },
  { href: ROUTES.stock,     label: "Stock" },
  { href: ROUTES.products,  label: "Products" },
  { href: ROUTES.vendors,   label: "Vendors", requires: "vendor.view" },
] as const;
