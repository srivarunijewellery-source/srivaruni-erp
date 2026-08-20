"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FeedbackDialog } from "@/features/feedback/FeedbackDialog";
import { getNoteContext } from "./note-actions";
import type { FeedbackType } from "@/features/feedback/queries";

/**
 * The counter's way in.
 *
 * Types and branches are fetched on first click rather than passed down
 * from the POS screen: that screen already takes a dozen props and
 * loads on a tablet over a shop connection, and this list is needed
 * only by the person who reaches for it.
 */
export function CounterNoteButton({ locationId }: { locationId: string }) {
  const [types, setTypes] = useState<FeedbackType[]>([]);
  const [stores, setStores] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [canPickStore, setCanPickStore] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await getNoteContext();
      if (r.ok) {
        setTypes(r.data.types);
        setStores(r.data.stores);
        setCanPickStore(r.data.canPickStore);
      }
      setReady(true);
    })();
  }, []);

  if (!ready || types.length === 0) {
    return (
      <Button size="sm" variant="secondary" disabled>
        Note
      </Button>
    );
  }

  return (
    <FeedbackDialog
      types={types}
      stores={stores}
      defaultLocationId={locationId}
      canPickStore={canPickStore}
      trigger={(open) => (
        <Button size="sm" variant="secondary" onClick={open}>
          Note
        </Button>
      )}
    />
  );
}
