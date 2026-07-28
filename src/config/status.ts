import type { InwardStatus, TransferStatus } from "@/types/domain";

/**
 * Status presentation. Tone names map to design tokens, so restyling a
 * status is a token change, never a component change.
 */
export type Tone = "pending" | "approved" | "transit" | "done" | "danger" | "neutral";

export const TONE_CLASS: Record<Tone, string> = {
  pending:  "bg-status-pending-bg text-status-pending-fg",
  approved: "bg-status-approved-bg text-status-approved-fg",
  transit:  "bg-status-transit-bg text-status-transit-fg",
  done:     "bg-status-done-bg text-status-done-fg",
  danger:   "bg-status-danger-bg text-status-danger-fg",
  neutral:  "bg-status-neutral-bg text-status-neutral-fg",
};

/** Labels are written for the person reading them, not the schema.
 *  "submitted" means nothing on a shop floor; "awaiting pricing" does. */
export const INWARD_STATUS: Record<InwardStatus, { label: string; tone: Tone }> = {
  draft:     { label: "Draft",            tone: "neutral" },
  submitted: { label: "Awaiting pricing", tone: "pending" },
  approved:  { label: "Approved",         tone: "done" },
  rejected:  { label: "Sent back",        tone: "danger" },
};

export const TRANSFER_STATUS: Record<TransferStatus, { label: string; tone: Tone }> = {
  requested:  { label: "Requested",  tone: "pending" },
  approved:   { label: "Approved",   tone: "approved" },
  dispatched: { label: "In transit", tone: "transit" },
  received:   { label: "Received",   tone: "done" },
  rejected:   { label: "Rejected",   tone: "danger" },
  cancelled:  { label: "Cancelled",  tone: "neutral" },
};
