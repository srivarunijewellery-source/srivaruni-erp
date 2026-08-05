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
  | "transfer.pick"
  | "transfer.approve"
  | "transfer.dispatch"
  | "transfer.receive"
  | "adjustment.approve"
  | "catalog.manage"
  | "vendor.view"
  | "customer.manage"
  | "pricing.manage"
  | "discount.manage"
  | "staff.view"
  | "staff.manage"
  | "attendance.mark"
  | "leave.approve"
  | "comms.view"
  | "comms.manage"
  | "accounts.view"
  | "accounts.manage"
  | "roles.manage"
  | "pos.sell"
  | "pos.discount"
  | "pos.coupon"
  | "pos.hold"
  | "pos.cancel_bill"
  | "pos.register_open"
  | "pos.register_close"
  | "stock.view";

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

  // Picking is shop-floor work. Anyone at the sending store does it;
  // the database also checks the caller is actually at that location.
  "transfer.pick": () => true,
  "transfer.approve": isManagerOrAbove,
  "transfer.dispatch": isManagerOrAbove,
  "transfer.receive": isManagerOrAbove,

  "adjustment.approve": isOwner,
  "catalog.manage": isOwner,
  "vendor.view": isManagerOrAbove,

  // Anyone at the counter needs to add a walk-in customer while
  // the person is standing there. RLS already limits writes to
  // authenticated staff, and customers cannot be deleted at all.
  "customer.manage": () => true,

  // Both pricing surfaces show landed cost by definition, and landed
  // cost is already owner-only at the RLS level. Anything softer here
  // would be a second door into the same room.
  "pricing.manage": isOwner,
  "discount.manage": isOwner,

  // A manager runs the shift, so they see the team and fill the
  // register. Hiring, pay and targets stay with the owner -- and pay is
  // additionally owner-only at the RLS level, so this is the softer of
  // two locks, not the only one.
  "staff.view": isManagerOrAbove,
  "staff.manage": isOwner,
  "attendance.mark": isManagerOrAbove,
  "leave.approve": isManagerOrAbove,

  // Managers need to see whether the message actually went out when a
  // vendor says they never got the payment advice. Only the owner holds
  // the credentials that send it.
  "comms.view": isManagerOrAbove,
  "comms.manage": isOwner,

  // The books show cost, margin and pay in aggregate. Every reason the
  // cost tables are owner-only applies here, and RLS on journals
  // enforces it regardless of what this says.
  "accounts.view": isOwner,
  "accounts.manage": isOwner,
  "roles.manage": isOwner,

  // Counter. Fallback only — in practice these come from the role a
  // person is assigned, which is the whole point of the roles screen.
  "pos.sell": isManagerOrAbove,
  "pos.discount": isManagerOrAbove,
  "pos.coupon": isManagerOrAbove,
  "pos.hold": isManagerOrAbove,
  "pos.cancel_bill": isManagerOrAbove,
  "pos.register_open": isManagerOrAbove,
  "pos.register_close": isManagerOrAbove,
  "stock.view": () => true,
};

/**
 * The permission check the whole interface uses.
 *
 * Reads the permission set resolved from the database at session time,
 * so a role edited in the admin screen changes what people see on their
 * next request rather than at the next deploy.
 *
 * RULES above is now only a FALLBACK, for a staff row that has no role
 * assigned yet -- which is possible for anyone created before roles
 * existed. Without it those users would see an empty app.
 *
 * Still not the security boundary. Every rule here is also enforced by
 * RLS and by explicit checks inside each SECURITY DEFINER function. If
 * the two disagree the database wins and the user sees an error, which
 * is the correct direction to fail.
 */
export function can(
  user: { role?: Role | null; permissions?: ReadonlySet<string> } | Role | null | undefined,
  capability: Capability,
): boolean {
  if (!user) return false;

  // Called with a bare role string (older call sites, and the login
  // screen which has no full user yet).
  if (typeof user === "string") return RULES[capability]?.(user) ?? false;

  if (user.permissions && user.permissions.size > 0) {
    return user.permissions.has(capability);
  }

  return user.role ? (RULES[capability]?.(user.role) ?? false) : false;
}
