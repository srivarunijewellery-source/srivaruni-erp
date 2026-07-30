"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestTransfer } from "./actions";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { ROUTES } from "@/config/nav";
import type { StoreLocation } from "@/types/domain";

export function RequestTransferForm({
  stores,
  defaultFromId,
}: {
  stores: StoreLocation[];
  defaultFromId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Request a transfer
      </Button>
    );
  }

  return (
    <Card>
      <CardBody>
        <form
          action={(fd) =>
            start(async () => {
              setError(null);
              const result = await requestTransfer(fd);
              if (result.ok) {
                setOpen(false);
                // An empty request is useless; go straight to picking items.
                router.push(ROUTES.transferDetail(result.data));
              } else setError(result.error);
            })
          }
          className="grid gap-3 sm:grid-cols-4 sm:items-end"
        >
          <div>
            <Label htmlFor="fromLocationId">From</Label>
            <Select id="fromLocationId" name="fromLocationId" defaultValue={defaultFromId ?? ""} required>
              <option value="" disabled>Choose store</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="toLocationId">To</Label>
            <Select id="toLocationId" name="toLocationId" defaultValue="" required>
              <option value="" disabled>Choose store</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="reason">Reason</Label>
            <Input id="reason" name="reason" placeholder="Zaheerabad running low on bangles" required />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Raising…" : "Raise request"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          {error && <div className="sm:col-span-4"><FieldError>{error}</FieldError></div>}
        </form>
      </CardBody>
    </Card>
  );
}
