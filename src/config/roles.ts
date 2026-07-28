import type { Role } from "@/types/domain";

/**
 * Roles mirror the `staff_role` enum in Postgres.
 *
 * These checks drive what the UI OFFERS. They are not the security
 * boundary — every rule here is also enforced by RLS and by explicit
 * authorization inside each SECURITY DEFINER function. If the two ever
 * disagree the database wins and the user sees an error, which is the
 * correct failure direction.
 */

const RANK: Record<Role, number> = { staff: 1, manager: 2, owner: 3 };

export const isOwner = (r: Role | null | undefined): r is "owner" => r === "owner";
export const isManagerOrAbove = (r: Role | null | undefined): boolean =>
  !!r && RANK[r] >= RANK.manager;

export type Capability =
  | "inward.create"
  | "inward.submit"
  | "inward.approve"
  | "inward.viewCost"
  | "transfer.request"
  | "transfer.approve"
  | "transfer.dispatch"
  | "transfer.receive"
  | "adjustment.approve"
  | "catalog.manage"
  | "vendor.view";

const RULES: Record<Capability, (r: Role) => boolean> = {
  // Creation is deliberately open. The control is at approval, so the
  // shop floor is never blocked waiting on Redmond to raise a document.
  "inward.create": () => true,
  "inward.submit": () => true,
  "inward.approve": isOwner,

  // Cost is not merely hidden in the UI: RLS returns zero rows from the
  // cost tables for anyone but the owner, so it never crosses the wire.
  "inward.viewCost": isOwner,

  "transfer.request": () => true,
  "transfer.approve": isManagerOrAbove,
  "transfer.dispatch": isManagerOrAbove,
  "transfer.receive": isManagerOrAbove,

  "adjustment.approve": isOwner,
  "catalog.manage": isOwner,
  "vendor.view": isManagerOrAbove,
};

/** Components ask can(role, "x"); they never compare roles directly. */
export function can(role: Role | null | undefined, capability: Capability): boolean {
  return role ? RULES[capability](role) : false;
}
