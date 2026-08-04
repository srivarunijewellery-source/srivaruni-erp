"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { ExternalIcon, RefreshIcon } from "@/components/ui/Icon";
import { formatDateTime } from "@/lib/format";
import type { Tone } from "@/config/status";
import {
  deleteWhatsappTemplate,
  draftTemplateForEvent,
  editWhatsappTemplate,
  mapEventTemplate,
  saveWhatsappCredentials,
  submitWhatsappTemplate,
  syncWhatsappTemplates,
  testWhatsappConnection,
} from "./whatsapp-actions";
import type {
  EventGroup,
  EventTemplateMap,
  WhatsappConnection,
  WhatsappTemplate,
} from "./queries";

const STATUS_TONE: Record<string, Tone> = {
  APPROVED: "done",
  PENDING: "pending",
  REJECTED: "danger",
  PAUSED: "pending",
  DISABLED: "neutral",
  DRAFT: "neutral",
};

export function WhatsappConsole({
  connection,
  templates,
  groups,
  maps,
}: {
  connection: WhatsappConnection | null;
  templates: WhatsappTemplate[];
  groups: EventGroup[];
  maps: EventTemplateMap[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<WhatsappTemplate | null>(null);
  // Prefill for the new-template form when drafted from an event.
  const [draft, setDraft] = useState<{
    name: string;
    body: string;
    examples: string;
    variableMap: string[];
    eventKey: string;
  } | null>(null);

  const mapByEvent = new Map(maps.map((m) => [m.eventKey, m]));
  const approved = templates.filter((t) => t.status === "APPROVED");
  const connected = Boolean(connection?.verifiedName);

  function run(fn: () => Promise<{ ok: boolean; data?: string; error?: string }>) {
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await fn();
      if (r.ok) setNotice(r.data ?? "Done.");
      else setError(r.error ?? "That did not work.");
    });
  }

  function saveCreds(formData: FormData) {
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await saveWhatsappCredentials(formData);
      if (r.ok) setNotice("Saved. Now press Test connection.");
      else setError(r.error);
    });
  }

  function submitNew(formData: FormData) {
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await submitWhatsappTemplate(formData);
      if (r.ok) {
        setNotice(r.data);
        setShowNew(false);
      } else setError(r.error);
    });
  }

  function submitEdit(formData: FormData) {
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await editWhatsappTemplate(formData);
      if (r.ok) {
        setNotice(r.data);
        setEditing(null);
      } else setError(r.error);
    });
  }

  function removeTemplate(t: WhatsappTemplate) {
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await deleteWhatsappTemplate(t.id);
      if (r.ok) setNotice(r.data);
      else setError(r.error);
    });
  }

  /** Turns an event's existing wording into a Meta-shaped draft. */
  function draftForEvent(eventKey: string) {
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await draftTemplateForEvent(eventKey);
      if (r.ok) {
        setDraft({ ...r.data, eventKey });
        setEditing(null);
        setShowNew(true);
        setNotice(
          "Drafted from the existing wording. Check it, then submit for approval — Meta usually decides within a few hours.",
        );
      } else setError(r.error);
    });
  }

  function saveMap(formData: FormData) {
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await mapEventTemplate(formData);
      if (r.ok) setNotice("Mapping saved.");
      else setError(r.error);
    });
  }

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------- connection */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-medium">
            Connection
            <Badge tone={connected ? "done" : "neutral"}>
              {connected ? "Connected" : "Not connected"}
            </Badge>
            {connection?.qualityRating && (
              <Badge tone={connection.qualityRating === "GREEN" ? "done" : "pending"}>
                Quality {connection.qualityRating}
              </Badge>
            )}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run(testWhatsappConnection)}
            >
              Test connection
            </Button>
          </div>
        </CardHeader>

        <CardBody className="space-y-3">
          {connected && (
            <p className="text-sm">
              <span className="font-medium">{connection?.verifiedName}</span>
              <span className="ml-2 font-mono text-text-muted">
                {connection?.displayNumber}
              </span>
              {connection?.lastSyncedAt && (
                <span className="ml-2 text-2xs text-text-muted">
                  checked {formatDateTime(connection.lastSyncedAt)}
                </span>
              )}
            </p>
          )}

          <form action={saveCreds} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="phoneNumberId">Phone number ID</Label>
                <Input
                  id="phoneNumberId"
                  name="phoneNumberId"
                  defaultValue={connection?.phoneNumberId ?? ""}
                  placeholder="1029384756"
                />
              </div>
              <div>
                <Label htmlFor="businessAccountId">WhatsApp Business Account ID</Label>
                <Input
                  id="businessAccountId"
                  name="businessAccountId"
                  defaultValue={connection?.businessAccountId ?? ""}
                  placeholder="2065302494312382"
                />
              </div>
              <div>
                <Label htmlFor="apiVersion">Graph API version</Label>
                <Input
                  id="apiVersion"
                  name="apiVersion"
                  defaultValue={connection?.apiVersion ?? "v21.0"}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="accessToken">System User access token</Label>
              <Input
                id="accessToken"
                name="accessToken"
                type="password"
                autoComplete="off"
                placeholder={
                  connection?.hasToken ? "•••••• stored — leave blank to keep" : "EAA..."
                }
              />
            </div>

            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save credentials"}
            </Button>
          </form>

          <details className="rounded-control border border-border bg-surface-sunken p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Where to find these
            </summary>
            <ol className="mt-2 space-y-2 text-2xs text-text-muted">
              <li>
                <strong>1. Business Account ID</strong> — Business Settings &rarr; Accounts
                &rarr; WhatsApp Accounts. It is the ID shown under the account name.
              </li>
              <li>
                <strong>2. Phone number ID</strong> — open that account &rarr; Phone
                numbers. This is <em>not</em> the phone number itself; it is the long
                numeric ID beside it.
              </li>
              <li>
                <strong>3. Access token</strong> — Business Settings &rarr; Users &rarr;
                System Users. Create a system user with admin access to the WhatsApp
                account, then Generate New Token with the{" "}
                <code className="font-mono">whatsapp_business_messaging</code> and{" "}
                <code className="font-mono">whatsapp_business_management</code>{" "}
                permissions. Choose a token with <strong>no expiry</strong> — a user
                token expires and sending stops silently.
              </li>
            </ol>
            <a
              href="https://business.facebook.com/settings"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-2xs text-brand hover:underline"
            >
              Open Business Settings
              <ExternalIcon size="size-3.5" />
            </a>
            <p className="mt-3 text-2xs text-text-muted">
              Another partner already having access to this number changes nothing —
              several systems can hold API access to one WhatsApp account at once, so
              adding this does not disturb an existing integration.
            </p>
          </details>
        </CardBody>
      </Card>

      {notice && <p className="text-sm text-status-done-fg">{notice}</p>}
      <FieldError>{error}</FieldError>

      {/* ---------------------------------------------------- readiness */}
      {(() => {
        // An event switched on for WhatsApp but with no approved
        // template is silently skipped at queue time -- correct
        // behaviour, but invisible unless it is said out loud here.
        const blocked = groups
          .flatMap((g) => g.events)
          .filter((e) => e.wired && e.channels.whatsapp?.enabled)
          .filter((e) => {
            const m = mapByEvent.get(e.key);
            if (!m?.templateId) return true;
            return !approved.some((t) => t.id === m.templateId);
          });

        if (!connection?.enabled) {
          return (
            <Card>
              <CardBody className="text-sm text-text-muted">
                WhatsApp is switched off in comms settings, so nothing sends on it yet —
                even with templates approved and mapped.
              </CardBody>
            </Card>
          );
        }

        if (blocked.length === 0) return null;

        return (
          <Card>
            <CardHeader className="flex items-center gap-2">
              <Badge tone="pending">{blocked.length}</Badge>
              <span className="font-medium">
                {blocked.length === 1 ? "event is" : "events are"} switched on but cannot send
              </span>
            </CardHeader>
            <CardBody className="space-y-2">
              <p className="text-2xs text-text-muted">
                These are ticked for WhatsApp but have no approved template mapped, so
                they are skipped rather than queued to fail. Create a template for each,
                wait for approval, then map it below.
              </p>
              <ul className="space-y-1.5">
                {blocked.map((e) => (
                  <li key={e.key} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{e.label}</span>
                    <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-2xs text-text-muted">
                      {e.key}
                    </code>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => draftForEvent(e.key)}
                    >
                      Create template
                    </Button>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        );
      })()}

      {/* ----------------------------------------------------- templates */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-medium">
            Templates{" "}
            <span className="text-2xs text-text-muted">
              {approved.length} approved of {templates.length}
            </span>
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run(syncWhatsappTemplates)}
            >
              <RefreshIcon size="size-3.5" />
              Sync from Meta
            </Button>
            <Button
              size="sm"
              variant={showNew ? "ghost" : "primary"}
              onClick={() => setShowNew(!showNew)}
            >
              {showNew ? "Cancel" : "New template"}
            </Button>
          </div>
        </CardHeader>

        {showNew && (
          <CardBody className="border-b border-border">
            <form action={submitNew} className="space-y-3" key={draft?.eventKey ?? "blank"}>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <Label htmlFor="tplName">Name</Label>
                  <Input
                    id="tplName"
                    name="name"
                    required
                    defaultValue={draft?.name ?? ""}
                    placeholder="purchase_confirmation"
                  />
                </div>
                <div>
                  <Label htmlFor="tplCategory">Category</Label>
                  <Select id="tplCategory" name="category" defaultValue="UTILITY">
                    <option value="UTILITY">Utility</option>
                    <option value="MARKETING">Marketing</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tplLang">Language</Label>
                  <Input id="tplLang" name="language" defaultValue="en" />
                </div>
              </div>

              <div>
                <Label htmlFor="tplBody">Message</Label>
                <Textarea
                  id="tplBody"
                  name="body"
                  rows={5}
                  required
                  defaultValue={draft?.body ?? ""}
                  placeholder={
                    "Dear {{1}}, thank you for shopping with Sri Varuni Fashion Jewellery. Your invoice {{2}} for {{3}} is ready."
                  }
                />
              </div>

              <div>
                <Label htmlFor="tplExamples">Sample values</Label>
                <Input
                  id="tplExamples"
                  name="examples"
                  defaultValue={draft?.examples ?? ""}
                  placeholder="Priya, BOD/26/00042, ₹2,450.00"
                />
              </div>

              <div>
                <Label htmlFor="tplFooter">Footer (optional)</Label>
                <Input id="tplFooter" name="footer" placeholder="Sri Varuni Fashion Jewellery" />
              </div>

              <p className="text-2xs text-text-muted">
                Use <code className="font-mono">{"{{1}}"}</code>,{" "}
                <code className="font-mono">{"{{2}}"}</code> for anything that changes.
                One sample value per placeholder, comma separated — Meta will not review a
                template whose samples do not match. Choose <strong>Utility</strong> for
                anything transactional: it is cheaper, approves faster and has no daily cap
                per customer. <strong>Marketing</strong> costs more and is limited to
                roughly two per person per day across every business messaging them.
              </p>

              {draft && (
                <p className="rounded-control bg-status-approved-bg px-3 py-2 text-2xs text-status-approved-fg">
                  Drafted from <strong>{draft.eventKey}</strong>. Named placeholders were
                  converted to Meta&rsquo;s numbered ones in order:{" "}
                  {draft.variableMap.map((v, i) => `{{${i + 1}}} = ${v}`).join(", ")}.
                  Once approved, map it to the event below with exactly that order.
                </p>
              )}

              <Button type="submit" disabled={pending}>
                {pending ? "Submitting…" : "Submit for approval"}
              </Button>
            </form>
          </CardBody>
        )}

        <CardBody className="p-0">
          {templates.length === 0 ? (
            <p className="px-4 py-6 text-sm text-text-muted">
              Nothing synced yet. Connect above, then press Sync from Meta to pull whatever
              is already approved on this account.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {templates.map((t) => (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium">{t.name}</span>
                    <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{t.status}</Badge>
                    <Badge tone="neutral">{t.category}</Badge>
                    <span className="text-2xs text-text-muted">{t.language}</span>
                    {t.variableCount > 0 && (
                      <span className="text-2xs text-text-muted">
                        {t.variableCount} variable{t.variableCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  {t.bodyText && (
                    <p className="mt-1.5 whitespace-pre-wrap rounded-control bg-surface-sunken px-3 py-2 text-2xs text-text-muted">
                      {t.bodyText}
                    </p>
                  )}
                  {t.rejectionReason && (
                    <p className="mt-1 text-2xs text-status-danger-fg">
                      Rejected: {t.rejectionReason}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {t.status === "PENDING" ? (
                      <span className="text-2xs text-text-muted">
                        In review — Meta does not allow editing until it decides. Delete
                        it if the wording is wrong.
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => {
                          setEditing(t);
                          setShowNew(false);
                          setDraft(null);
                        }}
                      >
                        Edit wording
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => removeTemplate(t)}
                    >
                      Delete
                    </Button>
                  </div>

                  {editing?.id === t.id && (
                    <form action={submitEdit} className="mt-3 space-y-3 rounded-control border border-border bg-surface-sunken p-3">
                      <input type="hidden" name="id" value={t.id} />
                      <div>
                        <Label htmlFor={`eb-${t.id}`}>Message</Label>
                        <Textarea
                          id={`eb-${t.id}`}
                          name="body"
                          rows={5}
                          required
                          defaultValue={t.bodyText ?? ""}
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <Label htmlFor={`ex-${t.id}`}>Sample values</Label>
                          <Input id={`ex-${t.id}`} name="examples" placeholder="Priya, BOD/26/00042" />
                        </div>
                        <div>
                          <Label htmlFor={`ef-${t.id}`}>Footer</Label>
                          <Input id={`ef-${t.id}`} name="footer" defaultValue={t.footerText ?? ""} />
                        </div>
                      </div>
                      <p className="text-2xs text-text-muted">
                        {t.status === "APPROVED"
                          ? "This goes back into review. The current wording keeps sending until the edit is approved, so nothing stops in the meantime."
                          : "Fix what the reviewer objected to and resubmit."}
                      </p>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={pending}>
                          {pending ? "Submitting…" : "Save and resubmit"}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* -------------------------------------------------- event mapping */}
      <Card>
        <CardHeader className="font-medium">Which template each event uses</CardHeader>
        <CardBody className="p-0">
          <p className="border-b border-border px-4 py-3 text-2xs text-text-muted">
            WhatsApp will only deliver a business-initiated message as an approved
            template, so each event has to point at one and say which payload value fills
            each numbered slot. An event with no mapping is skipped rather than queued to
            fail.
          </p>

          {groups.map((g) => (
            <div key={g.label}>
              <p className="bg-surface-sunken px-4 py-1.5 text-2xs font-medium uppercase tracking-wide text-text-muted">
                {g.label}
              </p>
              <ul className="divide-y divide-border">
                {g.events
                  .filter((e) => e.wired)
                  .map((e) => {
                    const m = mapByEvent.get(e.key);
                    return (
                      <li key={e.key} className="px-4 py-3">
                        <form action={saveMap} className="space-y-2">
                          <input type="hidden" name="event" value={e.key} />
                          <div className="flex flex-wrap items-end gap-2">
                            <div className="min-w-40 flex-1">
                              <Label htmlFor={`t-${e.key}`}>{e.label}</Label>
                              <Select
                                id={`t-${e.key}`}
                                name="templateId"
                                defaultValue={m?.templateId ?? ""}
                              >
                                <option value="">Not sent on WhatsApp</option>
                                {approved.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name} ({t.variableCount})
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <div className="min-w-48 flex-1">
                              <Label htmlFor={`v-${e.key}`}>Values in order</Label>
                              <Input
                                id={`v-${e.key}`}
                                name="variables"
                                defaultValue={m?.variableMap.join(", ") ?? ""}
                                placeholder={e.variables.slice(0, 3).join(", ")}
                              />
                            </div>
                            <Button type="submit" size="sm" variant="secondary" disabled={pending}>
                              Save
                            </Button>
                            {!m?.templateId && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={pending}
                                onClick={() => draftForEvent(e.key)}
                              >
                                Create template
                              </Button>
                            )}
                          </div>
                          {e.variables.length > 0 && (
                            <p className="flex flex-wrap gap-1">
                              {e.variables.map((v) => (
                                <code
                                  key={v}
                                  className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-2xs text-text-muted"
                                >
                                  {v}
                                </code>
                              ))}
                            </p>
                          )}
                        </form>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
