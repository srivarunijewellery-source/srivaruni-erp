"use client";

import { useState, useTransition } from "react";
import { submitInward, approveInward, rejectInward } from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, FieldError } from "@/components/ui/Field";
import type { InwardStatus } from "@/types/domain";

/**
 * The forward move, and only that one. What the owner sees here is the
 * pricing gate: until they approve, none of these items can be billed.
 */
export function InwardWorkflow({
  inwardId,
  status,
  canApprove,
}: {
  inwardId: string;
  status: InwardStatus;
  canApprove: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const run = (fn: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, extra?: Record<string, string>) =>
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("inwardId", inwardId);
      for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
      const result = await fn(fd);
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      else setRejecting(false);
    });

  if (status === "approved") {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-text-muted">
            Approved. Stock is posted and these items are billable.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-medium">Next step</h2>
      </CardHeader>
      <CardBody className="space-y-3">
        {status === "draft" && (
          <>
            <p className="text-sm text-text-muted">
              Send this to the owner for pricing. You will not be able to edit it afterwards.
            </p>
            <Button
              variant="primary"
              fullWidth
              disabled={pending}
              onClick={() => run(submitInward)}
            >
              {pending ? "Sending…" : "Send for pricing"}
            </Button>
          </>
        )}

        {status === "submitted" && !canApprove && (
          <p className="text-sm text-text-muted">
            With the owner for pricing. Nothing here can be sold until it is approved.
          </p>
        )}

        {status === "submitted" && canApprove && !rejecting && (
          <>
            <p className="text-sm text-text-muted">
              Approving posts stock and makes every item billable.
            </p>
            <Button
              variant="primary"
              fullWidth
              disabled={pending}
              onClick={() => run(approveInward)}
            >
              {pending ? "Approving…" : "Approve and post stock"}
            </Button>
            <Button variant="ghost" fullWidth onClick={() => setRejecting(true)}>
              Send back
            </Button>
          </>
        )}

        {rejecting && (
          <form
            action={(fd) => run(rejectInward, { reason: String(fd.get("reason") ?? "") })}
            className="space-y-2"
          >
            <Input name="reason" placeholder="What needs fixing?" autoFocus required />
            <div className="flex gap-2">
              <Button type="submit" variant="danger" disabled={pending}>
                Send back
              </Button>
              <Button type="button" variant="ghost" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {error && <FieldError>{error}</FieldError>}
      </CardBody>
    </Card>
  );
}
