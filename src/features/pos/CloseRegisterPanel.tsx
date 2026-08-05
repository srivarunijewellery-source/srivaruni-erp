"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { formatPaise } from "@/lib/money";
import { closeRegister } from "./actions";

export function CloseRegisterPanel({
  sessionId,
  terminal,
  openingFloatPaise,
  unsent,
  onClose,
}: {
  sessionId: string;
  terminal: string;
  openingFloatPaise: number;
  unsent: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  function doClose() {
    start(async () => {
      setError(null);
      const r = await closeRegister(sessionId, Number(counted) || 0, note || null);
      if (r.ok) {
        setResult(r.data);
        router.refresh();
      } else setError(r.error);
    });
  }

  return (
    <Modal title={`Close ${terminal}`} onClose={onClose} width="max-w-lg">
      {result ? (
        <div className="space-y-3">
          <p className="text-sm">Closed.</p>
          <div className="space-y-1.5 rounded-control bg-surface-sunken p-3 text-sm">
            <Row label="Expected in drawer" value={formatPaise(Number(result.expected_paise ?? 0))} />
            <Row label="Counted" value={formatPaise(Number(result.counted_paise ?? 0))} />
            <Row
              label="Difference"
              value={formatPaise(Number(result.variance_paise ?? 0))}
              tone={Number(result.variance_paise ?? 0) === 0 ? "ok" : "bad"}
            />
            <Row label="Sales today" value={formatPaise(Number(result.sales_paise ?? 0))} />
          </div>
          <Button onClick={() => (window.location.href = "/pos")}>Done</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {unsent > 0 && (
            <p className="rounded-control bg-status-pending-bg px-3 py-2 text-2xs text-status-pending-fg">
              <Badge tone="pending">{unsent}</Badge> sale{unsent === 1 ? " is" : "s are"}{" "}
              still waiting to send. Closing now means the drawer count will not include
              them, and the variance will look wrong. Get back online first if you can.
            </p>
          )}

          <p className="text-2xs text-text-muted">
            Count the cash physically, then type what you found. Opening float was{" "}
            {formatPaise(openingFloatPaise)}. The system works out what it expects; a
            difference is recorded either way, so there is nothing to be gained by
            adjusting the number to match.
          </p>

          <div>
            <Label htmlFor="counted">Cash counted ₹</Label>
            <Input
              id="counted"
              type="number"
              min={0}
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              className="w-44"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="note">Note</Label>
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <FieldError>{error}</FieldError>

          <div className="flex gap-2">
            <Button onClick={doClose} disabled={pending || counted === ""}>
              {pending ? "Closing…" : "Close register"}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "bad";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-muted">{label}</span>
      <span
        className={`font-mono ${
          tone === "ok" ? "text-status-done-fg" : tone === "bad" ? "text-status-danger-fg" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
