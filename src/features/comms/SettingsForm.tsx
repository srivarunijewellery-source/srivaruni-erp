"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { ROUTES } from "@/config/nav";
import { saveCommsSettings, sendTestMessage } from "./actions";
import type { CommsSettings } from "./queries";

export function CommsSettingsForm({
  settings,
  unreachable,
}: {
  settings: CommsSettings;
  unreachable: Array<{ name: string; role: string }>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [emailOn, setEmailOn] = useState(settings.emailEnabled);
  const [waOn, setWaOn] = useState(settings.whatsappEnabled);
  const [provider, setProvider] = useState(settings.emailProvider);

  function submit(fd: FormData) {
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await saveCommsSettings(fd);
      if (r.ok) setNotice("Settings saved.");
      else setError(r.error);
    });
  }

  function test(fd: FormData) {
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await sendTestMessage(fd);
      if (r.ok) setNotice(r.data);
      else setError(r.error);
    });
  }

  return (
    <div className="space-y-4">
      {settings.paused && (
        <Card>
          <CardBody className="flex items-start gap-3">
            <Badge tone="pending">Paused</Badge>
            <p className="text-sm text-text-muted">
              Nothing is being delivered. Events still queue into the outbox, so you
              can see exactly what would have gone out before switching this off.
            </p>
          </CardBody>
        </Card>
      )}

      {unreachable.length > 0 && (
        <Card>
          <CardBody>
            <p className="text-sm font-medium">
              {unreachable.length === 1 ? "One person has" : `${unreachable.length} people have`}{" "}
              no email address
            </p>
            <p className="mt-1 text-2xs text-text-muted">
              {unreachable.map((u) => `${u.name} (${u.role})`).join(", ")} &mdash; alerts
              addressed to them are skipped silently, which looks identical to a broken
              API key. Add addresses on the Staff page.
            </p>
          </CardBody>
        </Card>
      )}

      <form action={submit}>
        <div className="space-y-4">
          <Card>
            <CardHeader className="font-medium">Email</CardHeader>
            <CardBody className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="emailEnabled"
                  checked={emailOn}
                  onChange={(e) => setEmailOn(e.target.checked)}
                  className="size-4 accent-brand"
                />
                Send email
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="provider">Provider</Label>
                  <Select
                    id="provider"
                    name="provider"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                  >
                    <option value="resend">Resend</option>
                    <option value="smtp">SMTP</option>
                    <option value="none">None</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="fromEmail">From address</Label>
                  <Input
                    id="fromEmail"
                    name="fromEmail"
                    type="email"
                    defaultValue={settings.fromEmail ?? ""}
                    placeholder="billing@yourdomain.com"
                  />
                </div>
                <div>
                  <Label htmlFor="fromName">From name</Label>
                  <Input id="fromName" name="fromName" defaultValue={settings.fromName} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="replyTo">Reply-to</Label>
                  <Input id="replyTo" name="replyTo" defaultValue={settings.replyTo ?? ""} />
                </div>
                <div>
                  <Label htmlFor="sendingDomain">Sending domain</Label>
                  <Input
                    id="sendingDomain"
                    name="sendingDomain"
                    defaultValue={settings.sendingDomain ?? ""}
                    placeholder="yourdomain.com"
                  />
                </div>
              </div>

              {provider === "resend" && (
                <div>
                  <Label htmlFor="resendKey">Resend API key</Label>
                  <Input
                    id="resendKey"
                    name="resendKey"
                    type="password"
                    autoComplete="off"
                    placeholder={
                      settings.hasResendKey ? "•••••• stored — leave blank to keep" : "re_..."
                    }
                  />
                  <p className="mt-1 text-2xs text-text-muted">
                    The domain above must have SPF, DKIM and DMARC records set and be
                    verified with the provider, or mail silently lands in spam. The
                    outbox will show the provider&rsquo;s own wording if it refuses.
                  </p>
                </div>
              )}

              {provider === "smtp" && (
                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <Label htmlFor="smtpHost">Host</Label>
                    <Input id="smtpHost" name="smtpHost" defaultValue={settings.smtpHost ?? ""} />
                  </div>
                  <div>
                    <Label htmlFor="smtpPort">Port</Label>
                    <Input
                      id="smtpPort"
                      name="smtpPort"
                      type="number"
                      defaultValue={settings.smtpPort ?? 587}
                    />
                  </div>
                  <div>
                    <Label htmlFor="smtpUser">Username</Label>
                    <Input id="smtpUser" name="smtpUser" defaultValue={settings.smtpUser ?? ""} />
                  </div>
                  <div>
                    <Label htmlFor="smtpPassword">Password</Label>
                    <Input
                      id="smtpPassword"
                      name="smtpPassword"
                      type="password"
                      autoComplete="off"
                      placeholder={settings.hasSmtpPassword ? "•••••• stored" : ""}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm sm:col-span-4">
                    <input
                      type="checkbox"
                      name="smtpSecure"
                      defaultChecked={settings.smtpSecure}
                      className="size-4 accent-brand"
                    />
                    Use TLS
                  </label>
                  <p className="text-2xs text-status-pending-fg sm:col-span-4">
                    SMTP is stored but not yet implemented in the sender &mdash; it needs a
                    TCP client that will not run on the edge. Use Resend for now.
                  </p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <span className="font-medium">WhatsApp</span>
              <Badge tone={settings.whatsappEnabled ? "done" : "neutral"}>
                {settings.whatsappEnabled ? "On" : "Off"}
              </Badge>
            </CardHeader>
            <CardBody className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="waEnabled"
                  checked={waOn}
                  onChange={(e) => setWaOn(e.target.checked)}
                  className="size-4 accent-brand"
                />
                Send WhatsApp
              </label>
              <p className="text-2xs text-text-muted">
                This switch is the master on/off. Everything else — the Meta connection,
                approved templates, and which template each event uses — lives on the
                WhatsApp page, because none of it is a simple field.
              </p>
              <Link
                href={ROUTES.whatsapp}
                className="inline-flex h-[var(--control-height)] items-center rounded-control border border-border bg-surface px-3 text-sm shadow-[var(--control-shadow)] transition-colors hover:border-border-strong hover:bg-surface-sunken"
              >
                Open WhatsApp setup
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="font-medium">Delivery</CardHeader>
            <CardBody className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="paused"
                  defaultChecked={settings.paused}
                  className="size-4 accent-brand"
                />
                Pause all sending
              </label>

              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <Label htmlFor="retryMax">Retries</Label>
                  <Input
                    id="retryMax"
                    name="retryMax"
                    type="number"
                    min={0}
                    max={10}
                    defaultValue={settings.retryMax}
                  />
                </div>
                <div>
                  <Label htmlFor="dailyCap">Daily cap</Label>
                  <Input
                    id="dailyCap"
                    name="dailyCap"
                    type="number"
                    min={1}
                    defaultValue={settings.dailyCap}
                  />
                </div>
                <div>
                  <Label htmlFor="testRecipient">Test address</Label>
                  <Input
                    id="testRecipient"
                    name="testRecipient"
                    type="email"
                    defaultValue={settings.testRecipient ?? ""}
                  />
                </div>
                <div className="flex items-end">
                  <p className="text-2xs text-text-muted">
                    Failed sends back off exponentially, so a provider outage does not
                    burn the retry budget in three minutes.
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save settings"}
            </Button>
            {notice && <span className="text-sm text-status-done-fg">{notice}</span>}
          </div>
          <FieldError>{error}</FieldError>
        </div>
      </form>

      <Card>
        <CardHeader className="font-medium">Send a test</CardHeader>
        <CardBody>
          <form action={test} className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                name="to"
                type="email"
                defaultValue={settings.testRecipient ?? ""}
                placeholder="you@example.com"
                className="w-72"
              />
            </div>
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "Sending…" : "Send test"}
            </Button>
          </form>
          <p className="mt-2 text-2xs text-text-muted">
            This bypasses the event matrix on purpose &mdash; it answers &ldquo;does the
            provider work at all&rdquo;, so a wrong API key cannot be mistaken for an
            unticked checkbox. Save your settings first, and untick Pause.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
