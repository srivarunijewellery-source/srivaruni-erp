import { createClient } from "@/lib/supabase/server";

import type { Channel, MessageStatus } from "./constants";

export type { Channel, MessageStatus };

export interface CommsSettings {
  emailEnabled: boolean;
  emailProvider: string;
  fromEmail: string | null;
  fromName: string;
  replyTo: string | null;
  sendingDomain: string | null;
  /** Never the key itself — only whether one is stored. */
  hasResendKey: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  hasSmtpPassword: boolean;
  smtpSecure: boolean;
  whatsappEnabled: boolean;
  whatsappProvider: string | null;
  whatsappApiUrl: string | null;
  hasWhatsappKey: boolean;
  whatsappFrom: string | null;
  testRecipient: string | null;
  retryMax: number;
  dailyCap: number;
  paused: boolean;
  lowStockQty: number;
  transitOverdueDays: number;
  lastScheduledOn: string | null;
  updatedAt: string;
}

export async function getCommsSettings(): Promise<CommsSettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comms_settings")
    .select(`email_enabled, email_provider, from_email, from_name, reply_to,
             sending_domain, resend_api_key, smtp_host, smtp_port, smtp_user,
             smtp_password, smtp_secure, whatsapp_enabled, whatsapp_provider,
             whatsapp_api_url, whatsapp_api_key, whatsapp_from, test_recipient,
             retry_max, daily_cap, paused, low_stock_qty, transit_overdue_days,
             last_scheduled_on, updated_at`)
    .maybeSingle();
  if (error || !data) return null;

  return {
    emailEnabled: Boolean(data.email_enabled),
    emailProvider: data.email_provider ?? "resend",
    fromEmail: data.from_email,
    fromName: data.from_name ?? "",
    replyTo: data.reply_to,
    sendingDomain: data.sending_domain,
    hasResendKey: Boolean(data.resend_api_key),
    smtpHost: data.smtp_host,
    smtpPort: data.smtp_port,
    smtpUser: data.smtp_user,
    hasSmtpPassword: Boolean(data.smtp_password),
    smtpSecure: Boolean(data.smtp_secure),
    whatsappEnabled: Boolean(data.whatsapp_enabled),
    whatsappProvider: data.whatsapp_provider,
    whatsappApiUrl: data.whatsapp_api_url,
    hasWhatsappKey: Boolean(data.whatsapp_api_key),
    whatsappFrom: data.whatsapp_from,
    testRecipient: data.test_recipient,
    retryMax: Number(data.retry_max ?? 3),
    dailyCap: Number(data.daily_cap ?? 500),
    paused: Boolean(data.paused),
    lowStockQty: Number(data.low_stock_qty ?? 2),
    transitOverdueDays: Number(data.transit_overdue_days ?? 5),
    lastScheduledOn: data.last_scheduled_on,
    updatedAt: data.updated_at,
  };
}

export interface EventChannelConfig {
  channel: Channel;
  enabled: boolean;
  recipientRule: string;
  customEmails: string[];
  customPhones: string[];
  subjectTpl: string | null;
  bodyTpl: string | null;
}

export interface EventRow {
  key: string;
  label: string;
  audience: "internal" | "customer";
  groupLabel: string;
  description: string | null;
  variables: string[];
  wired: boolean;
  channels: Record<string, EventChannelConfig>;
}

export interface EventGroup {
  label: string;
  events: EventRow[];
}

/** The matrix, grouped the way the settings page renders it. */
export async function listEventMatrix(): Promise<EventGroup[]> {
  const supabase = await createClient();

  const { data: events, error: e1 } = await supabase
    .from("comms_events")
    .select("key, label, audience, group_label, description, variables, wired, sort_order")
    .order("sort_order");
  if (e1) throw e1;

  const { data: channels, error: e2 } = await supabase
    .from("comms_event_channels")
    .select(`event_key, channel, enabled, recipient_rule, custom_emails,
             custom_phones, subject_tpl, body_tpl`);
  if (e2) throw e2;

  const byEvent = new Map<string, Record<string, EventChannelConfig>>();
  for (const c of channels ?? []) {
    const bucket = byEvent.get(c.event_key) ?? {};
    bucket[c.channel] = {
      channel: c.channel as Channel,
      enabled: Boolean(c.enabled),
      recipientRule: c.recipient_rule,
      customEmails: c.custom_emails ?? [],
      customPhones: c.custom_phones ?? [],
      subjectTpl: c.subject_tpl,
      bodyTpl: c.body_tpl,
    };
    byEvent.set(c.event_key, bucket);
  }

  const groups = new Map<string, EventRow[]>();
  for (const e of events ?? []) {
    const row: EventRow = {
      key: e.key,
      label: e.label,
      audience: e.audience as "internal" | "customer",
      groupLabel: e.group_label,
      description: e.description,
      variables: e.variables ?? [],
      wired: Boolean(e.wired),
      channels: byEvent.get(e.key) ?? {},
    };
    const list = groups.get(e.group_label) ?? [];
    list.push(row);
    groups.set(e.group_label, list);
  }

  return Array.from(groups.entries()).map(([label, evs]) => ({ label, events: evs }));
}

export interface OutboxMessage {
  id: string;
  channel: Channel;
  status: MessageStatus;
  eventKey: string | null;
  toEmail: string | null;
  toPhone: string | null;
  toName: string | null;
  subject: string | null;
  body: string;
  entityType: string | null;
  entityId: string | null;
  attempts: number;
  lastError: string | null;
  queuedAt: string;
  sentAt: string | null;
}

export interface OutboxFilters {
  status?: MessageStatus | "all";
  channel?: Channel | "all";
  eventKey?: string;
  limit?: number;
}

export async function listOutbox(filters: OutboxFilters = {}): Promise<OutboxMessage[]> {
  const supabase = await createClient();
  let q = supabase
    .from("message_outbox")
    .select(`id, channel, status, event_key, to_email, to_phone, to_name, subject,
             body, entity_type, entity_id, attempts, last_error, queued_at, sent_at`)
    .order("queued_at", { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.channel && filters.channel !== "all") q = q.eq("channel", filters.channel);
  if (filters.eventKey) q = q.eq("event_key", filters.eventKey);

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: r.id,
    channel: r.channel as Channel,
    status: r.status as MessageStatus,
    eventKey: r.event_key,
    toEmail: r.to_email,
    toPhone: r.to_phone,
    toName: r.to_name,
    subject: r.subject,
    body: r.body,
    entityType: r.entity_type,
    entityId: r.entity_id,
    attempts: Number(r.attempts ?? 0),
    lastError: r.last_error,
    queuedAt: r.queued_at,
    sentAt: r.sent_at,
  }));
}

export interface OutboxStats {
  queued: number;
  sent: number;
  failed: number;
  cancelled: number;
  sending: number;
}

export async function getOutboxStats(): Promise<OutboxStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("message_outbox").select("status");
  if (error) throw error;

  const stats: OutboxStats = { queued: 0, sent: 0, failed: 0, cancelled: 0, sending: 0 };
  for (const r of data ?? []) {
    const k = r.status as MessageStatus;
    if (k in stats) stats[k] += 1;
  }
  return stats;
}

/**
 * Staff with no address cannot receive anything. Surfaced on the
 * settings page because the alternative is a silently empty outbox and
 * an afternoon spent blaming the API key.
 */
export async function getUnreachableStaff(): Promise<Array<{ name: string; role: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff")
    .select("name, role, email")
    .eq("active", true)
    .in("role", ["owner", "manager"]);
  if (error) return [];

  return (data ?? [])
    .filter((s) => !s.email || s.email.trim() === "")
    .map((s) => ({ name: s.name, role: s.role }));
}

export interface WhatsappTemplate {
  id: string;
  metaId: string | null;
  name: string;
  language: string;
  category: string;
  status: string;
  bodyText: string | null;
  footerText: string | null;
  variableCount: number;
  rejectionReason: string | null;
  syncedAt: string | null;
}

export async function listWhatsappTemplates(): Promise<WhatsappTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_templates")
    .select(`id, meta_id, name, language, category, status, body_text,
             footer_text, variable_count, rejection_reason, synced_at`)
    .order("status")
    .order("name");
  if (error) return [];

  return (data ?? []).map((r) => ({
    id: r.id,
    metaId: r.meta_id,
    name: r.name,
    language: r.language,
    category: r.category,
    status: r.status,
    bodyText: r.body_text,
    footerText: r.footer_text,
    variableCount: Number(r.variable_count ?? 0),
    rejectionReason: r.rejection_reason,
    syncedAt: r.synced_at,
  }));
}

export interface EventTemplateMap {
  eventKey: string;
  templateId: string | null;
  variableMap: string[];
}

export async function listEventTemplateMaps(): Promise<EventTemplateMap[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_event_templates")
    .select("event_key, template_id, variable_map");
  if (error) return [];

  return (data ?? []).map((r) => ({
    eventKey: r.event_key,
    templateId: r.template_id,
    variableMap: r.variable_map ?? [],
  }));
}

export interface WhatsappConnection {
  phoneNumberId: string | null;
  businessAccountId: string | null;
  hasToken: boolean;
  apiVersion: string;
  verifiedName: string | null;
  displayNumber: string | null;
  qualityRating: string | null;
  lastSyncedAt: string | null;
  enabled: boolean;
}

export async function getWhatsappConnection(): Promise<WhatsappConnection | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comms_settings")
    .select(`wa_phone_number_id, wa_business_account_id, wa_access_token,
             wa_api_version, wa_verified_name, wa_display_number,
             wa_quality_rating, wa_last_synced_at, whatsapp_enabled`)
    .maybeSingle();
  if (error || !data) return null;

  return {
    phoneNumberId: data.wa_phone_number_id,
    businessAccountId: data.wa_business_account_id,
    hasToken: Boolean(data.wa_access_token),
    apiVersion: data.wa_api_version ?? "v21.0",
    verifiedName: data.wa_verified_name,
    displayNumber: data.wa_display_number,
    qualityRating: data.wa_quality_rating,
    lastSyncedAt: data.wa_last_synced_at,
    enabled: Boolean(data.whatsapp_enabled),
  };
}
