"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { sendTestTemplate, type TestSendResult } from "./whatsapp-actions";
import type { WhatsappTemplate } from "./queries";

/**
 * Send one template to one number and see exactly what Meta says back.
 *
 * Bypasses the outbox and the event matrix entirely on purpose — this
 * answers "does this template, to this number, actually work", not
 * "does the queue work". Routing it through the normal machinery would
 * make a misconfigured recipient rule look identical to Meta rejecting
 * the template.
 */
export function TestSendPanel({ templates }: { templates: WhatsappTemplate[] }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [phone, setPhone] = useState("");
  const [values, setValues] = useState<string[]>([]);
  const [result, setResult] = useState<TestSendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approved = useMemo(
    () => templates.filter((t) => t.status === "APPROVED"),
    [templates],
  );
  const tpl = approved.find((t) => t.id === templateId) ?? null;

  function pick(id: string) {
    setTemplateId(id);
    const t = approved.find((x) => x.id === id);
    setValues(Array.from({ length: t?.variableCount ?? 0 }, () => ""));
    setResult(null);
    setError(null);
  }

  function send() {
    start(async () => {
      setError(null);
      setResult(null);
      const r = await sendTestTemplate(templateId, phone, values);
      if (r.ok) setResult(r.data);
      else setError(r.error);
    });
  }

  const ready = templateId && phone.trim() && values.every((v) => v.trim());

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <span className="font-medium">Send a test</span>
        <Button size="sm" variant={open ? "ghost" : "secondary"} onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Open"}
        </Button>
      </CardHeader>

      {open && (
        <CardBody className="space-y-3">
          <p className="text-2xs text-text-muted">
            Sends one real message straight to Meta — no queue, no recipient rule, no
            event. If a template works here but not through an event, the problem is in
            the mapping or the recipient, not the template itself.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ts-template">Template</Label>
              <Select id="ts-template" value={templateId} onChange={(e) => pick(e.target.value)}>
                <option value="">Pick an approved template</option>
                {approved.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.variableCount} slot{t.variableCount === 1 ? "" : "s"})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="ts-phone">Send to</Label>
              <Input
                id="ts-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9876543210 or +919876543210"
              />
              <p className="mt-1 text-2xs text-text-muted">
                A bare 10-digit number is assumed +91.
              </p>
            </div>
          </div>

          {tpl && tpl.variableCount > 0 && (
            <div className="space-y-1.5">
              {Array.from({ length: tpl.variableCount }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <code className="w-12 font-mono text-2xs text-text-muted">{`{{${i + 1}}}`}</code>
                  <Input
                    aria-label={`Value for slot ${i + 1}`}
                    value={values[i] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => {
                        const next = [...prev];
                        next[i] = e.target.value;
                        return next;
                      })
                    }
                    placeholder={`Value for {{${i + 1}}}`}
                  />
                </div>
              ))}
            </div>
          )}

          {tpl?.bodyText && (
            <p className="whitespace-pre-wrap rounded-control bg-surface-sunken px-3 py-2 text-2xs text-text-muted">
              {tpl.bodyText}
            </p>
          )}

          <Button onClick={send} disabled={!ready || pending}>
            {pending ? "Sending…" : "Send test message"}
          </Button>

          <FieldError>{error}</FieldError>

          {result && (
            <div className="space-y-2 rounded-control border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={result.ok ? "done" : "danger"}>
                  {result.ok ? "Sent" : "Failed"}
                </Badge>
                {result.httpStatus !== null && (
                  <span className="text-2xs text-text-muted">
                    HTTP {result.httpStatus}
                  </span>
                )}
                <span className="text-2xs text-text-muted">
                  {result.request.templateName} ({result.request.language}) &rarr;{" "}
                  {result.request.to}
                </span>
              </div>

              {result.error && (
                <p className="text-sm text-status-danger-fg">{result.error}</p>
              )}

              <details open={!result.ok}>
                <summary className="cursor-pointer text-2xs text-text-muted">
                  Raw response from Meta
                </summary>
                <pre className="mt-1.5 max-h-64 overflow-auto rounded-control bg-surface-sunken p-2.5 font-mono text-2xs">
                  {JSON.stringify(result.raw, null, 2)}
                </pre>
              </details>

              <details>
                <summary className="cursor-pointer text-2xs text-text-muted">
                  What was sent
                </summary>
                <pre className="mt-1.5 overflow-auto rounded-control bg-surface-sunken p-2.5 font-mono text-2xs">
                  {JSON.stringify(result.request, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </CardBody>
      )}
    </Card>
  );
}
