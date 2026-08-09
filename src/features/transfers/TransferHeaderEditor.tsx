"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Field";
import { updateTransferHeader } from "./actions";

/**
 * The reason and note on a request that has not moved yet.
 *
 * The reason is what the receiving store reads to understand why a
 * hundred and eighty pieces have turned up, and it gets typed in a hurry
 * while raising the request. Until now the only way to correct it was to
 * cancel the transfer and rebuild every line — so nobody did, and the
 * wrong reason stayed on the document forever.
 *
 * Collapsed by default: most transfers never need it, and an always-open
 * form above the lines would push the actual work down the page.
 */
export function TransferHeaderEditor({
  transferId,
  reason,
  note,
}: {
  transferId: string;
  reason: string | null;
  note: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draftReason, setDraftReason] = useState(reason ?? "");
  const [draftNote, setDraftNote] = useState(note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-2xs text-brand hover:underline"
      >
        Edit reason or note
      </button>
    );
  }

  return (
    <Card className="mb-4">
      <CardBody className="space-y-3">
        <div>
          <Label htmlFor="tr-reason">Reason</Label>
          <Input
            id="tr-reason"
            autoFocus
            value={draftReason}
            onChange={(e) => setDraftReason(e.target.value)}
            placeholder="Why this stock is moving"
            className="w-full"
          />
        </div>
        <div>
          <Label htmlFor="tr-note">Note</Label>
          <Input
            id="tr-note"
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            placeholder="Anything the other store should know"
            className="w-full"
          />
        </div>

        {error && <FieldError>{error}</FieldError>}

        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await updateTransferHeader(transferId, draftReason, draftNote);
                if (!r.ok) setError(r.error);
                else {
                  setOpen(false);
                  router.refresh();
                }
              })
            }
          >
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              // Discards back to what the server holds, not to blank —
              // cancelling an edit should leave things as they were.
              setDraftReason(reason ?? "");
              setDraftNote(note ?? "");
              setOpen(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
