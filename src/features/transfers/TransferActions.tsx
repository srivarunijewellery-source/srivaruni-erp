"use client";

import { useTransition, useState } from "react";
import { approveTransfer, dispatchTransfer, receiveTransfer } from "./actions";
import { Button } from "@/components/ui/Button";
import { can } from "@/config/roles";
import type { Role, TransferSummary } from "@/types/domain";

/**
 * The next legal step in the lifecycle, and only that one.
 *
 * Showing every possible action and disabling most is noise; the document
 * is only ever in one state, so it only ever has one forward move.
 */
export function TransferActions({
  transfer,
  role,
}: {
  transfer: TransferSummary;
  role: Role;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const step = (() => {
    switch (transfer.status) {
      case "requested":
        return can(role, "transfer.approve")
          ? { label: "Approve", run: approveTransfer }
          : null;
      case "approved":
        return can(role, "transfer.dispatch")
          ? { label: "Dispatch", run: dispatchTransfer }
          : null;
      case "dispatched":
        return can(role, "transfer.receive")
          ? { label: "Confirm receipt", run: receiveTransfer }
          : null;
      default:
        return null;
    }
  })();

  if (!step) return null;

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-2xs text-status-danger-fg">{error}</span>}
      <Button
        size="sm"
        variant="primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const fd = new FormData();
            fd.set("transferId", transfer.id);
            const result = await step.run(fd);
            if (!result.ok) setError(result.error);
          })
        }
      >
        {pending ? "Working…" : step.label}
      </Button>
    </div>
  );
}
