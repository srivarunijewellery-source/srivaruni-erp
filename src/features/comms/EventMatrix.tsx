"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { CHANNELS, RECIPIENT_RULES, type Channel } from "./constants";
import type { EventGroup, EventRow } from "./queries";
import { saveEventChannel, toggleEventChannel } from "./actions";

/**
 * Events down the rows, channels across the columns, exactly as asked.
 *
 * A checkbox writes immediately rather than waiting for a Save at the
 * bottom of a very long page — losing forty toggles to a stray refresh
 * is the kind of thing you only forgive once.
 */
export function EventMatrix({
  groups,
  emailEnabled,
  whatsappEnabled,
}: {
  groups: EventGroup[];
  emailEnabled: boolean;
  whatsappEnabled: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ event: EventRow; channel: Channel } | null>(null);

  const channelLive: Record<Channel, boolean> = {
    email: emailEnabled,
    whatsapp: whatsappEnabled,
    sms: false,
  };

  function toggle(eventKey: string, channel: Channel, enabled: boolean) {
    start(async () => {
      setError(null);
      const r = await toggleEventChannel(eventKey, channel, enabled);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <FieldError>{error}</FieldError>

      {groups.map((g) => (
        <Card key={g.label}>
          <CardHeader className="flex items-center justify-between gap-3">
            <span className="font-medium">{g.label}</span>
            <div className="flex gap-6 pr-2">
              {CHANNELS.map((c) => (
                <span
                  key={c.key}
                  className={
                    channelLive[c.key]
                      ? "text-2xs font-medium text-text-muted"
                      : "text-2xs text-text-subtle line-through"
                  }
                  title={
                    channelLive[c.key]
                      ? undefined
                      : `${c.label} is switched off at the top, so these do not send.`
                  }
                >
                  {c.label}
                </span>
              ))}
            </div>
          </CardHeader>

          <CardBody className="p-0">
            <ul className="divide-y divide-border">
              {g.events.map((e) => (
                <li key={e.key} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={e.wired ? "text-sm font-medium" : "text-sm text-text-muted"}>
                        {e.label}
                      </span>
                      <Badge tone={e.audience === "customer" ? "transit" : "neutral"}>
                        {e.audience === "customer" ? "customer" : "internal"}
                      </Badge>
                      {!e.wired && (
                        <Badge tone="pending" >Not built yet</Badge>
                      )}
                    </div>
                    {e.description && (
                      <p className="mt-0.5 text-2xs text-text-muted">{e.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-6">
                    {CHANNELS.map((c) => {
                      const cfg = e.channels[c.key];
                      return (
                        <div key={c.key} className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            aria-label={`${c.label} for ${e.label}`}
                            checked={Boolean(cfg?.enabled)}
                            disabled={!e.wired || pending}
                            onChange={(ev) => toggle(e.key, c.key, ev.target.checked)}
                            className="size-4 accent-brand disabled:opacity-40"
                          />
                          <button
                            type="button"
                            onClick={() => setEditing({ event: e, channel: c.key })}
                            className="text-2xs text-text-subtle underline-offset-2 hover:text-brand hover:underline"
                            title="Recipients and wording"
                          >
                            edit
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ))}

      {editing && (
        <ChannelEditor
          event={editing.event}
          channel={editing.channel}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ChannelEditor({
  event,
  channel,
  onClose,
}: {
  event: EventRow;
  channel: Channel;
  onClose: () => void;
}) {
  const cfg = event.channels[channel];
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rule, setRule] = useState(cfg?.recipientRule ?? "owner");

  function submit(fd: FormData) {
    start(async () => {
      setError(null);
      const r = await saveEventChannel(fd);
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <Modal title={`${event.label} — ${channel}`} onClose={onClose} width="max-w-2xl">
      <form action={submit} className="space-y-3">
        <input type="hidden" name="event" value={event.key} />
        <input type="hidden" name="channel" value={channel} />
        <input type="hidden" name="enabled" value={cfg?.enabled ? "true" : "false"} />

        <div>
          <Label htmlFor="rule">Who receives it</Label>
          <Select id="rule" name="rule" value={rule} onChange={(e) => setRule(e.target.value)}>
            {RECIPIENT_RULES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-2xs text-text-muted">
            Resolved when the event fires, not now &mdash; so a manager who joins next
            week starts receiving these without anyone re-saving this page.
          </p>
        </div>

        {rule === "custom" && (
          <div>
            <Label htmlFor="customEmails">
              {channel === "email" ? "Email addresses" : "Phone numbers"}
            </Label>
            <Input
              id="customEmails"
              name={channel === "email" ? "customEmails" : "customPhones"}
              defaultValue={(channel === "email"
                ? cfg?.customEmails
                : cfg?.customPhones
              )?.join(", ")}
              placeholder="Separate with commas"
            />
          </div>
        )}

        {channel === "email" && (
          <div>
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" name="subject" defaultValue={cfg?.subjectTpl ?? ""} />
          </div>
        )}

        <div>
          <Label htmlFor="body">Message</Label>
          <textarea
            id="body"
            name="body"
            rows={8}
            defaultValue={cfg?.bodyTpl ?? ""}
            className="w-full rounded-control border border-border bg-surface px-3 py-2 font-mono text-sm focus:border-brand focus:outline-none"
          />
        </div>

        {event.variables.length > 0 && (
          <div>
            <p className="text-2xs text-text-muted">
              Available placeholders &mdash; anything else renders empty rather than
              leaving braces in the message someone reads:
            </p>
            <p className="mt-1 flex flex-wrap gap-1">
              {event.variables.map((v) => (
                <code
                  key={v}
                  className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-2xs"
                >
                  {`{{${v}}}`}
                </code>
              ))}
            </p>
          </div>
        )}

        <FieldError>{error}</FieldError>

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
