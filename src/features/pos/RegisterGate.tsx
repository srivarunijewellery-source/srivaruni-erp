"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { formatPaise } from "@/lib/money";
import { ROUTES } from "@/config/nav";
import { openRegister } from "./actions";
import type { Branch, OpenSessionAt } from "./queries";

/**
 * Stands between a person and the till.
 *
 * A sale rung outside a register session belongs to no day and no
 * drawer: it never shows in a close, and the cash never reconciles.
 * Rather than allowing it and warning, the counter simply does not
 * appear until a session is chosen — a warning at the top of a busy
 * screen is a warning nobody reads.
 */
export function RegisterGate({
  locationId,
  locationName,
  sessions,
  branches,
  canChooseBranch,
  canOpen,
}: {
  locationId: string;
  locationName: string;
  sessions: OpenSessionAt[];
  branches: Branch[];
  canChooseBranch: boolean;
  canOpen: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [terminal, setTerminal] = useState(
    `Counter ${sessions.length + 1}`,
  );
  const [float, setFloat] = useState("");

  function go(sessionId: string) {
    router.push(`${ROUTES.pos}?branch=${locationId}&session=${sessionId}`);
  }

  function doOpen() {
    start(async () => {
      setError(null);
      const r = await openRegister(locationId, Number(float) || 0, terminal);
      if (r.ok) go(r.data);
      else setError(r.error);
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {canChooseBranch && branches.length > 1 && (
        <Card>
          <CardHeader className="font-medium">Branch</CardHeader>
          <CardBody>
            <Select
              value={locationId}
              onChange={(e) => router.push(`${ROUTES.pos}?branch=${e.target.value}`)}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
                  {b.hasOpenRegister ? " · open" : ""}
                </option>
              ))}
            </Select>
          </CardBody>
        </Card>
      )}

      {sessions.length > 0 && (
        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <span className="font-medium">Pick a counter</span>
            <Badge tone="done">
              {sessions.length} open at {locationName}
            </Badge>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-border">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => go(s.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-sunken"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{s.terminal}</p>
                      <p className="text-2xs text-text-muted">
                        opened by {s.openedByName ?? "—"} at{" "}
                        {new Date(s.openedAt).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · float {formatPaise(s.openingFloatPaise)}
                      </p>
                    </div>
                    <span className="text-sm text-brand">Use this &rarr;</span>
                  </button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader className="font-medium">
          {sessions.length === 0 ? "No counter is open" : "Open another counter"}
        </CardHeader>
        <CardBody className="space-y-3">
          {sessions.length === 0 && (
            <p className="text-sm text-text-muted">
              Nothing can be sold at {locationName} until a register is open. Every sale
              belongs to a counter and a day, so the drawer can be counted at close.
            </p>
          )}

          {!canOpen ? (
            <p className="text-sm text-text-muted">
              Ask a manager to open the register.
            </p>
          ) : !opening ? (
            <Button onClick={() => setOpening(true)}>Open a register</Button>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label htmlFor="terminal">Counter name</Label>
                  <Input
                    id="terminal"
                    value={terminal}
                    onChange={(e) => setTerminal(e.target.value)}
                    className="w-44"
                  />
                </div>
                <div>
                  <Label htmlFor="float">Opening cash ₹</Label>
                  <Input
                    id="float"
                    type="number"
                    min={0}
                    value={float}
                    onChange={(e) => setFloat(e.target.value)}
                    className="w-36"
                    autoFocus
                  />
                </div>
              </div>
              <p className="text-2xs text-text-muted">
                Count the drawer before you type. This figure is what the close is
                measured against, so a guess here becomes a variance later.
              </p>
              <div className="flex gap-2">
                <Button onClick={doOpen} disabled={pending}>
                  {pending ? "Opening…" : "Open and start billing"}
                </Button>
                <Button variant="ghost" onClick={() => setOpening(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <FieldError>{error}</FieldError>
        </CardBody>
      </Card>
    </div>
  );
}
