"use client";

import { useState, useTransition } from "react";
import { removeInwardLine } from "./actions";

/** Only offered while the document is still a draft. Once it goes for
 *  pricing the lines are out of the store's hands. */
export function LineActions({
  lineId,
  inwardId,
}: {
  lineId: string;
  inwardId: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-2xs text-status-danger-fg">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const fd = new FormData();
            fd.set("lineId", lineId);
            fd.set("inwardId", inwardId);
            const result = await removeInwardLine(fd);
            if (!result.ok) setError(result.error);
          })
        }
        className="rounded-control px-2 py-1 text-2xs text-text-muted hover:bg-status-danger-bg hover:text-status-danger-fg disabled:opacity-50"
      >
        {pending ? "Removing…" : "Remove"}
      </button>
    </div>
  );
}
