"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, FieldError } from "@/components/ui/Field";
import { ROUTES } from "@/config/nav";
import { deleteTransfer } from "./actions";

/**
 * Throws away a request that was never acted on.
 *
 * Only shown before picking starts, and the database refuses after that
 * regardless — from the first scan onward the document describes
 * something that physically happened.
 *
 * Two steps rather than one: the first tap only reveals the confirm, so
 * a mis-tap on a phone cannot discard ninety lines of someone's
 * afternoon. A reason is asked for but not demanded — requiring one
 * teaches people to type "x".
 */
export function DiscardTransfer({
  transferId,
  docNo,
  lines,
}: {
  transferId: string;
  docNo: string;
  lines: number;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="text-2xs text-text-muted hover:text-status-danger-fg hover:underline"
      >
        Discard this request
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-control border border-status-danger-fg/40 p-3">
      <p className="text-2xs">
        Throw away {docNo} and its {lines} line{lines === 1 ? "" : "s"}? Nothing has
        been picked, so no stock moves — the request simply stops existing.
      </p>
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why? (optional)"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="danger"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const fd = new FormData();
              fd.set("transferId", transferId);
              fd.set("reason", reason);
              const res = await deleteTransfer(fd);
              if (!res.ok) setError(res.error);
              else router.push(ROUTES.transfers);
            })
          }
        >
          {pending ? "Discarding…" : "Yes, discard it"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>
          Keep it
        </Button>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
