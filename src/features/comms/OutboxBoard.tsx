"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldError } from "@/components/ui/Field";
import { ROUTES } from "@/config/nav";
import { formatDateTime } from "@/lib/format";
import type { Tone } from "@/config/status";
import { cancelMessage, retryMessage, runScheduledEvents } from "./actions";
import type { MessageStatus } from "./constants";
import type { OutboxMessage, OutboxStats } from "./queries";

const STATUS_TONE: Record<MessageStatus, Tone> = {
  queued: "pending",
  sending: "transit",
  sent: "done",
  failed: "danger",
  cancelled: "neutral",
};

const FILTERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "queued", label: "Queued" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export function OutboxBoard({
  messages,
  stats,
  status,
  canManage,
  paused,
}: {
  messages: OutboxMessage[];
  stats: OutboxStats;
  status: string;
  canManage: boolean;
  paused: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<OutboxMessage | null>(null);

  function retry(id: string) {
    start(async () => {
      setError(null);
      const r = await retryMessage(id);
      if (!r.ok) setError(r.error);
    });
  }

  function cancel(id: string) {
    start(async () => {
      setError(null);
      const r = await cancelMessage(id);
      if (!r.ok) setError(r.error);
    });
  }

  function runDaily() {
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await runScheduledEvents();
      if (r.ok) setNotice(r.data);
      else setError(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <Link
                key={f.value}
                href={`${ROUTES.comms}?status=${f.value}`}
                className={
                  status === f.value
                    ? "rounded-control bg-brand px-3 py-1.5 text-sm text-brand-fg"
                    : "rounded-control border border-border px-3 py-1.5 text-sm hover:bg-surface-sunken"
                }
              >
                {f.label}
                {f.value !== "all" && (
                  <span className="ml-1.5 text-2xs opacity-75">
                    {stats[f.value as MessageStatus] ?? 0}
                  </span>
                )}
              </Link>
            ))}
          </div>

          {canManage && (
            <Button variant="secondary" onClick={runDaily} disabled={pending}>
              {pending ? "Running…" : "Run daily job now"}
            </Button>
          )}
        </CardHeader>

        {(paused || notice) && (
          <CardBody className="space-y-2 py-3">
            {paused && (
              <p className="text-sm text-status-pending-fg">
                Sending is paused, so queued messages will sit here until you turn it on
                in <Link href={ROUTES.commsSettings} className="underline">comms settings</Link>.
              </p>
            )}
            {notice && <p className="text-sm text-status-done-fg">{notice}</p>}
          </CardBody>
        )}
      </Card>

      <FieldError>{error}</FieldError>

      {messages.length === 0 ? (
        <EmptyState
          title="Nothing here"
          hint="Messages appear as events happen. Switch events on in comms settings."
        />
      ) : (
        <Card>
          <CardBody className="p-0">
            <ul className="divide-y divide-border">
              {messages.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>
                      <span className="text-2xs text-text-muted">{m.channel}</span>
                      <button
                        type="button"
                        onClick={() => setPreview(m)}
                        className="truncate text-sm font-medium hover:text-brand"
                      >
                        {m.subject || "(no subject)"}
                      </button>
                    </div>
                    <p className="mt-0.5 truncate text-2xs text-text-muted">
                      {m.toEmail ?? m.toPhone}
                      {m.toName ? ` · ${m.toName}` : ""}
                      {m.eventKey ? ` · ${m.eventKey}` : " · test"}
                      {` · ${formatDateTime(m.sentAt ?? m.queuedAt)}`}
                      {m.attempts > 1 ? ` · ${m.attempts} attempts` : ""}
                    </p>
                    {m.lastError && (
                      <p className="mt-0.5 truncate text-2xs text-status-danger-fg">
                        {m.lastError}
                      </p>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex gap-2">
                      {(m.status === "failed" || m.status === "cancelled") && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => retry(m.id)}
                        >
                          Retry
                        </Button>
                      )}
                      {m.status === "queued" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => cancel(m.id)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {preview && (
        <Modal
          title={preview.subject || "Message"}
          onClose={() => setPreview(null)}
          width="max-w-2xl"
        >
          <div className="space-y-3">
            <p className="text-2xs text-text-muted">
              To {preview.toEmail ?? preview.toPhone} · {preview.channel} ·{" "}
              {preview.eventKey ?? "test"}
            </p>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-control bg-surface-sunken p-3 font-sans text-sm">
              {preview.body}
            </pre>
            {preview.lastError && (
              <p className="text-sm text-status-danger-fg">{preview.lastError}</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
