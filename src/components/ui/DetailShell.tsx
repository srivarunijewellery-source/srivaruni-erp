"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";

/**
 * Read-first record layout.
 *
 * A record should read like a record. Fields that are permanently live
 * invite accidental edits by someone who only opened the page to look
 * something up, so editing is an explicit mode you enter.
 */
export function DetailShell({
  title,
  view,
  edit,
}: {
  title: string;
  view: React.ReactNode;
  edit: (done: () => void) => React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">{title}</h2>
          {!editing && (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardBody>{editing ? edit(() => setEditing(false)) : view}</CardBody>
    </Card>
  );
}

/** Label/value row for read mode. */
export function Fact({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-1.5 last:border-0">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-right text-sm">{value}</span>
    </div>
  );
}
