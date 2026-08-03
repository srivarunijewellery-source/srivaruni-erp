/**
 * Client-safe constants. See the note in features/staff/constants.ts —
 * a value import from queries.ts pulls the server Supabase client, and
 * with it `next/headers`, into the browser bundle.
 */

export type Channel = "email" | "whatsapp" | "sms";
export type MessageStatus = "queued" | "sending" | "sent" | "failed" | "cancelled";

export const RECIPIENT_RULES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "owner",             label: "Owner" },
  { value: "manager",           label: "Managers" },
  { value: "owner_and_manager", label: "Owner and managers" },
  { value: "actor",             label: "Whoever did it" },
  { value: "location_staff",    label: "Everyone at that store" },
  { value: "customer",          label: "The customer" },
  { value: "custom",            label: "A fixed list" },
] as const;

export const CHANNELS: ReadonlyArray<{ key: Channel; label: string }> = [
  { key: "email",    label: "Email" },
  { key: "whatsapp", label: "WhatsApp" },
] as const;
