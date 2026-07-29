"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Document by default, editor on request.
 *
 * The record was previously rendered as a page full of live inputs, so
 * anyone who opened it to read a figure could change one by accident.
 * Reading is now the default state and editing is entered deliberately.
 */
export function DocModeSwitch({
  canEdit,
  editLabel,
  document,
  editor,
}: {
  canEdit: boolean;
  editLabel: string;
  document: React.ReactNode;
  editor: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">
          {editing ? editLabel : "Product details"}
        </h2>
        {canEdit && (
          <Button
            variant={editing ? "primary" : "secondary"}
            onClick={() => setEditing(!editing)}
          >
            {editing ? "Done" : editLabel}
          </Button>
        )}
      </div>

      {editing ? editor : document}
    </div>
  );
}
