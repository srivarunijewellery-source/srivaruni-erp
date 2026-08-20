"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Label, Select, FieldError } from "@/components/ui/Field";
import { logFeedback } from "./actions";
import type { FeedbackType } from "./queries";

/**
 * Logging a note, from wherever the person happens to be.
 *
 * Deliberately reachable from the counter rather than only at close.
 * A customer asks for something we do not have and walks out; that is
 * the moment it is worth writing down, not four hours later when the
 * till is being counted and nobody remembers the size.
 *
 * Three fields and nothing else. Free text on purpose -- pinning a note
 * to a design code or a bill number would be tidier to report on and
 * would stop it being written at all on a busy Saturday.
 */
export function FeedbackDialog({
  types,
  stores,
  defaultLocationId,
  canPickStore,
  trigger,
  onLogged,
}: {
  types: FeedbackType[];
  stores: Array<{ id: string; code: string; name: string }>;
  defaultLocationId: string;
  /** Managers cover both branches by phone, so they choose. Counter
   *  staff get their own branch and no picker to mis-tap. */
  canPickStore: boolean;
  trigger?: (open: () => void) => React.ReactNode;
  onLogged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, start] = useTransition();

  const hint = types.find((t) => t.id === typeId)?.hint;

  function submit() {
    start(async () => {
      setError(null);
      const r = await logFeedback(typeId, locationId, description);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDescription("");
      setSaved(true);
      onLogged?.();
      // Left open on purpose: notes arrive in threes at closing time,
      // and reopening the dialog for each one is how the third gets
      // skipped.
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Log a note
        </Button>
      )}

      {open && (
        <Modal title="Log a note" onClose={() => setOpen(false)} width="max-w-lg">
          <div className="space-y-3">
            <div>
              <Label htmlFor="fb-type">Kind</Label>
              <Select
                id="fb-type"
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
              >
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
              {hint && <p className="mt-1 text-2xs text-text-muted">{hint}</p>}
            </div>

            {canPickStore && (
              <div>
                <Label htmlFor="fb-store">Which branch</Label>
                <Select
                  id="fb-store"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-2xs text-text-muted">
                  The branch it is about, which need not be the one you are
                  standing in.
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="fb-text">What happened</Label>
              <textarea
                id="fb-text"
                autoFocus
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Two customers asked for 2.12 mens kada in rose gold today. None on the shelf."
                className="w-full rounded-control border border-border bg-surface px-2 py-1.5 text-sm"
              />
            </div>

            {error && <FieldError>{error}</FieldError>}
            {saved && (
              <p className="text-2xs text-status-done-fg">
                Logged. Add another, or close.
              </p>
            )}

            <div className="flex gap-2">
              <Button
                disabled={busy || description.trim().length === 0}
                onClick={submit}
              >
                {busy ? "Saving…" : "Log it"}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
