"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Field";
import { formatPaise } from "@/lib/money";
import { closeRegister, openRegister } from "./actions";

export function RegisterPanel({
  locationId,
  locationName,
  sessionId,
  openedAt,
  floatPaise,
  canOpen,
  canClose,
}: {
  locationId: string;
  locationName: string;
  sessionId: string | null;
  openedAt: string | null;
  floatPaise: number;
  canOpen: boolean;
  canClose: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openFloat, setOpenFloat] = useState("");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [closing, setClosing] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  function doOpen() {
    start(async () => {
      setError(null);
      const r = await openRegister(locationId, Number(openFloat) || 0);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }

  function doClose() {
    if (!sessionId) return;
    start(async () => {
      setError(null);
      const r = await closeRegister(sessionId, Number(counted) || 0, note || null);
      if (r.ok) {
        setResult(r.data);
        setClosing(false);
        router.refresh();
      } else setError(r.error);
    });
  }

  if (!sessionId) {
    return (
      <Card>
        <CardHeader className="font-medium">Open the register</CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-text-muted">
            {locationName} has no register open. Sales can still be rung up, but they
            will not be attached to a day, so the drawer cannot be reconciled at close.
          </p>
          {canOpen ? (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="float">Opening cash ₹</Label>
                <Input
                  id="float"
                  type="number"
                  min={0}
                  value={openFloat}
                  onChange={(e) => setOpenFloat(e.target.value)}
                  className="w-36"
                />
              </div>
              <Button onClick={doOpen} disabled={pending}>
                {pending ? "Opening…" : "Open register"}
              </Button>
            </div>
          ) : (
            <p className="text-2xs text-text-muted">
              Ask a manager to open the register.
            </p>
          )}
          <FieldError>{error}</FieldError>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">Register</span>
        <span className="text-2xs text-text-muted">
          open since {openedAt ? new Date(openedAt).toLocaleTimeString("en-IN") : "—"} ·
          float {formatPaise(floatPaise)}
        </span>
      </CardHeader>
      <CardBody className="space-y-3">
        {result && (
          <div className="rounded-control bg-surface-sunken p-3 text-sm">
            <p className="font-medium">Closed</p>
            <p className="mt-1 text-2xs text-text-muted">
              Expected {formatPaise(Number(result.expected_paise ?? 0))} · counted{" "}
              {formatPaise(Number(result.counted_paise ?? 0))} · variance{" "}
              <span
                className={
                  Number(result.variance_paise ?? 0) === 0
                    ? "text-status-done-fg"
                    : "text-status-danger-fg"
                }
              >
                {formatPaise(Number(result.variance_paise ?? 0))}
              </span>
            </p>
          </div>
        )}

        {canClose && !closing && (
          <Button variant="secondary" onClick={() => setClosing(true)}>
            Close register
          </Button>
        )}

        {closing && (
          <div className="space-y-2">
            <div>
              <Label htmlFor="counted">Cash counted in the drawer ₹</Label>
              <Input
                id="counted"
                type="number"
                min={0}
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                className="w-40"
              />
            </div>
            <div>
              <Label htmlFor="note">Note</Label>
              <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <p className="text-2xs text-text-muted">
              Count first, then type. The difference against what the system expects is
              recorded either way — a variance is information, not something to hide.
            </p>
            <div className="flex gap-2">
              <Button onClick={doClose} disabled={pending || counted === ""}>
                {pending ? "Closing…" : "Close and count"}
              </Button>
              <Button variant="ghost" onClick={() => setClosing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <FieldError>{error}</FieldError>
      </CardBody>
    </Card>
  );
}
