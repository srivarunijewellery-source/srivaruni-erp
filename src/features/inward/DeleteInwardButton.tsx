"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { ROUTES } from "@/config/nav";
import { deleteInward } from "./actions";

/**
 * Owner-only. Two steps and a reason, because this removes a document
 * rather than reversing it — there is nothing left afterwards except the
 * audit entry, so the reason is the only explanation that survives.
 */
export function DeleteInwardButton({
  inwardId,
  docNo,
  status,
}: {
  inwardId: string;
  docNo: string;
  status: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Shown but disabled once approved, so it is clear the option exists
  // and why it does not apply, rather than silently absent.
  const approved = status === "approved";

  return (
    <>
      <button
        type="button"
        disabled={approved}
        title={
          approved
            ? "Approved inwards cannot be deleted — the stock has landed. Reverse it instead."
            : undefined
        }
        onClick={() => setOpen(true)}
        className="rounded-control px-3 py-2 text-sm text-text-subtle hover:text-status-danger-fg disabled:cursor-not-allowed disabled:opacity-50"
      >
        Delete
      </button>

      {open && (
        <Modal title={`Delete ${docNo}`} onClose={() => setOpen(false)} width="max-w-md">
          <div className="space-y-3">
            <p className="text-sm">
              This removes the document and its lines for good. Nothing is
              reversed, because nothing has landed yet.
            </p>

            <div>
              <Label htmlFor="why">Why</Label>
              <Input
                id="why"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="entered twice by mistake"
              />
              <p className="mt-1 text-2xs text-text-muted">
                Kept in the audit log. It is the only record that will remain.
              </p>
            </div>

            <FieldError>{error}</FieldError>

            <div className="flex gap-2">
              <Button
                variant="danger"
                disabled={pending || !reason.trim()}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const r = await deleteInward(inwardId, reason);
                    if (r.ok) router.push(ROUTES.inward);
                    else setError(r.error);
                  })
                }
              >
                {pending ? "Deleting…" : "Delete it"}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Keep it
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
