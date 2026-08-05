"use client";

import { useMemo, useState, useTransition } from "react";
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
  EventRow,
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
  const [draft, setDraft] = useState<{
    name: string;
    body: string;
    examples: string;
    variableMap: string[];
    eventKey: string;
  } | null>(null);

  // A flat list of ninety-nine templates is unusable, so this is
  // collapsed and filtered. Most of the time the only live question is
  // "which template does this event use", not "show me everything".
  const [showTemplates, setShowTemplates] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("ALL");
  const [status, setStatus] = useState("APPROVED");

  const mapByEvent = new Map(maps.map((m) => [m.eventKey, m]));
  const approved = useMemo(
    () => templates.filter((t) => t.status === "APPROVED"),
    [templates],
  );
  const connected = Boolean(connection?.verifiedName);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return templates.filter((t) => {
      if (status !== "ALL" && t.status !== status) return false;
      if (cat !== "ALL" && t.category !== cat) return false;
      if (!needle) return true;
      return (
        t.name.toLowerCase().includes(needle) ||
        (t.bodyText ?? "").toLowerCase().includes(needle)
      );
    });
  }, [templates, q, cat, status]);

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
        setDraft(null);
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

  function draftForEvent(eventKey: string) {
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await draftTemplateForEvent(eventKey);
      if (r.ok) {
        setDraft({ ...r.data, eventKey });
        setEditing(null);
        setShowNew(true);
        setShowTemplates(true);
        setNotice("Drafted from the existing wording. Check it, then submit for approval.");
      } else setError(r.error);
    });
  }

  return (
    <div className="space-y-4">
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
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => run(testWhatsappConnection)}
          >
            Test connection
          </Button>
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

          <details className="rounded-control border border-border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
              Credentials
            </summary>
            <div className="border-t border-border p-3">
              <form action={saveCreds} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="phoneNumberId">Phone number ID</Label>
                    <Input
                      id="phoneNumberId"
                      name="phoneNumberId"
                      defaultValue={connection?.phoneNumberId ?? ""}
                    />
                  </div>
                  <div>
                    <Label htmlFor="businessAccountId">Business Account ID</Label>
                    <Input
                      id="businessAccountId"
                      name="businessAccountId"
                      defaultValue={connection?.businessAccountId ?? ""}
                    />
                  </div>
                  <div>
                    <Label htmlFor="apiVersion">API version</Label>
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
                <a
                  href="https://business.facebook.com/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-3 inline-flex items-center gap-1.5 text-2xs text-brand hover:underline"
                >
                  Open Business Settings <ExternalIcon size="size-3.5" />
                </a>
              </form>
            </div>
          </details>
        </CardBody>
      </Card>

      {notice && <p className="text-sm text-status-done-fg">{notice}</p>}
      <FieldError>{error}</FieldError>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">What each event sends</span>
          <span className="text-2xs text-text-muted">
            {maps.filter((m) => m.templateId).length} of{" "}
            {groups.flatMap((g) => g.events).filter((e) => e.wired).length} mapped
          </span>
        </CardHeader>
        <CardBody className="p-0">
          <p className="border-b border-border px-4 py-2.5 text-2xs text-text-muted">
            WhatsApp only delivers a business-initiated message as a template Meta has
            approved. Pick one, then say which value fills each numbered slot. An event
            with no mapping is skipped rather than queued to fail.
          </p>

          {groups.map((g) => (
            <div key={g.label}>
              <p className="bg-surface-sunken px-4 py-1.5 text-2xs font-medium uppercase tracking-wide text-text-muted">
                {g.label}
              </p>
              <ul className="divide-y divide-border">
                {g.events
                  .filter((e) => e.wired)
                  .map((e) => (
                    <EventMapRow
                      key={e.key}
                      event={e}
                      mapping={mapByEvent.get(e.key) ?? null}
                      approved={approved}
                      pending={pending}
                      onSaved={setNotice}
                      onError={setError}
                      onCreate={() => draftForEvent(e.key)}
                    />
                  ))}
              </ul>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowTemplates(!showTemplates)}
            className="font-medium hover:text-brand"
          >
            Templates{" "}
            <span className="text-2xs text-text-muted">
              {approved.length} approved of {templates.length} ·{" "}
              {showTemplates ? "hide" : "show"}
            </span>
          </button>
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
              onClick={() => {
                setShowNew(!showNew);
                setShowTemplates(true);
              }}
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
                  placeholder={"Dear {{1}}, your invoice {{2}} for {{3}} is ready."}
                />
              </div>
              <div>
                <Label htmlFor="tplExamples">Sample values</Label>
                <Input
                  id="tplExamples"
                  name="examples"
                  defaultValue={draft?.examples ?? ""}
                  placeholder="Priya, BOD/26/00042, Rs. 2450.00"
                />
              </div>
              <div>
                <Label htmlFor="tplFooter">Footer (optional)</Label>
                <Input id="tplFooter" name="footer" />
              </div>
              <p className="text-2xs text-text-muted">
                One sample per <code className="font-mono">{"{{n}}"}</code> placeholder,
                comma separated — Meta will not review a template whose samples do not
                match. Choose <strong>Utility</strong> for anything transactional: cheaper,
                faster to approve, and no daily cap per customer.
              </p>
              <Button type="submit" disabled={pending}>
                {pending ? "Submitting…" : "Submit for approval"}
              </Button>
            </form>
          </CardBody>
        )}

        {showTemplates && (
          <>
            <CardBody className="flex flex-wrap gap-2 border-b border-border">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name or wording"
                className="min-w-48 flex-1"
              />
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-40"
              >
                <option value="APPROVED">Approved</option>
                <option value="PENDING">Pending</option>
                <option value="REJECTED">Rejected</option>
                <option value="ALL">Any status</option>
              </Select>
              <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-40">
                <option value="ALL">Any category</option>
                <option value="UTILITY">Utility</option>
                <option value="MARKETING">Marketing</option>
              </Select>
            </CardBody>

            <CardBody className="p-0">
              {filtered.length === 0 ? (
                <p className="px-4 py-6 text-sm text-text-muted">
                  Nothing matches.{" "}
                  {templates.length === 0 && "Press Sync from Meta first."}
                </p>
              ) : (
                <ul className="max-h-[32rem] divide-y divide-border overflow-auto">
                  {filtered.map((t) => (
                    <li key={t.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-medium">{t.name}</span>
                        <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{t.status}</Badge>
                        <Badge tone="neutral">{t.category}</Badge>
                        <span className="text-2xs text-text-muted">
                          {t.language} · {t.variableCount} variable
                          {t.variableCount === 1 ? "" : "s"}
                        </span>
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
                            In review — Meta does not allow editing until it decides.
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={pending}
                            onClick={() => {
                              setEditing(t);
                              setShowNew(false);
                            }}
                          >
                            Edit wording
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => run(() => deleteWhatsappTemplate(t.id))}
                        >
                          Delete
                        </Button>
                      </div>

                      {editing?.id === t.id && (
                        <form
                          action={submitEdit}
                          className="mt-3 space-y-3 rounded-control border border-border bg-surface-sunken p-3"
                        >
                          <input type="hidden" name="id" value={t.id} />
                          <Textarea name="body" rows={5} required defaultValue={t.bodyText ?? ""} />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Input name="examples" placeholder="Sample values, comma separated" />
                            <Input
                              name="footer"
                              defaultValue={t.footerText ?? ""}
                              placeholder="Footer"
                            />
                          </div>
                          <p className="text-2xs text-text-muted">
                            {t.status === "APPROVED"
                              ? "Goes back into review. The current wording keeps sending until the edit is approved."
                              : "Fix what the reviewer objected to and resubmit."}
                          </p>
                          <div className="flex gap-2">
                            <Button type="submit" size="sm" disabled={pending}>
                              Save and resubmit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditing(null)}
                            >
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
          </>
        )}
      </Card>
    </div>
  );
}

/**
 * One event's mapping.
 *
 * The first version asked for the variable names as a typed comma list
 * and rejected the save if the count was wrong — with ninety-nine
 * templates and no indication of how many slots any of them had, that
 * was effectively unusable, which is why mapping did not work.
 *
 * Choosing a template now renders exactly one dropdown per slot, filled
 * from that event's own payload keys, so a count mismatch is impossible
 * and there is nothing to type.
 */
function EventMapRow({
  event,
  mapping,
  approved,
  pending,
  onSaved,
  onError,
  onCreate,
}: {
  event: EventRow;
  mapping: EventTemplateMap | null;
  approved: WhatsappTemplate[];
  pending: boolean;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
  onCreate: () => void;
}) {
  const [saving, start] = useTransition();
  const [templateId, setTemplateId] = useState(mapping?.templateId ?? "");
  const [slots, setSlots] = useState<string[]>(mapping?.variableMap ?? []);

  const tpl = approved.find((t) => t.id === templateId) ?? null;
  const need = tpl?.variableCount ?? 0;

  function pickTemplate(id: string) {
    setTemplateId(id);
    const t = approved.find((x) => x.id === id);
    const n = t?.variableCount ?? 0;
    // Pre-filled from the event's own variables in order — usually
    // right, and always adjustable.
    setSlots(Array.from({ length: n }, (_, i) => slots[i] ?? event.variables[i] ?? ""));
  }

  function save() {
    start(async () => {
      const fd = new FormData();
      fd.set("event", event.key);
      fd.set("templateId", templateId);
      fd.set("variables", slots.join(","));
      const r = await mapEventTemplate(fd);
      if (r.ok) onSaved(`${event.label} mapped.`);
      else onError(r.error);
    });
  }

  const ready = !templateId || (slots.length === need && slots.every(Boolean));

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Label htmlFor={`t-${event.key}`}>{event.label}</Label>
          <Select
            id={`t-${event.key}`}
            value={templateId}
            onChange={(e) => pickTemplate(e.target.value)}
          >
            <option value="">Not sent on WhatsApp</option>
            {approved.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.variableCount} slot{t.variableCount === 1 ? "" : "s"})
              </option>
            ))}
          </Select>
        </div>

        <Button
          size="sm"
          variant="secondary"
          disabled={pending || saving || !ready}
          onClick={save}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
        {!templateId && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={onCreate}>
            Create one
          </Button>
        )}
      </div>

      {tpl && need > 0 && (
        <div className="mt-2 space-y-1.5">
          {Array.from({ length: need }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <code className="w-12 font-mono text-2xs text-text-muted">{`{{${i + 1}}}`}</code>
              <Select
                aria-label={`Value for slot ${i + 1}`}
                value={slots[i] ?? ""}
                onChange={(e) =>
                  setSlots((prev) => {
                    const next = [...prev];
                    next[i] = e.target.value;
                    return next;
                  })
                }
                className="max-w-56"
              >
                <option value="">Pick a value</option>
                {event.variables.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
          ))}
          {tpl.bodyText && (
            <p className="whitespace-pre-wrap rounded-control bg-surface-sunken px-3 py-2 text-2xs text-text-muted">
              {tpl.bodyText}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
