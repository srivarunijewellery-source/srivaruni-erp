"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { generateCoupons } from "./actions";
import { ROUTES } from "@/config/nav";
import { addDays, todayIso } from "@/lib/dates";

const today = () => todayIso();
const inDays = (n: number) =>
  addDays(todayIso(), n);

export function GenerateForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [prefix, setPrefix] = useState("SV");
  const [startNumber, setStartNumber] = useState(1001);
  const [count, setCount] = useState(50);

  // Shows the exact first and last code before anything is written --
  // a batch of 500 with the wrong prefix is tedious to undo.
  const pad = Math.max(3, String(startNumber + count - 1).length);
  const sample = (n: number) => `${prefix.toUpperCase()}-${String(n).padStart(pad, "0")}`;

  function submit(formData: FormData) {
    start(async () => {
      setError(null);
      const result = await generateCoupons(formData);
      if (result.ok) router.push(ROUTES.couponBatch(result.data));
      else setError(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <span className="font-medium">New coupon batch</span>
      </CardHeader>
      <CardBody>
        <form action={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Batch name</Label>
              <Input id="name" name="name" required placeholder="Diwali 2026" />
            </div>
            <div>
              <Label htmlFor="prefix">Code prefix</Label>
              <Input
                id="prefix"
                name="prefix"
                required
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                className="font-mono uppercase"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="kind">Discount type</Label>
              <Select
                id="kind"
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as "percent" | "amount")}
              >
                <option value="percent">Percent off</option>
                <option value="amount">Rupees off</option>
              </Select>
            </div>
            {kind === "percent" ? (
              <div>
                <Label htmlFor="percentOff">Percent off</Label>
                <Input
                  id="percentOff"
                  name="percentOff"
                  type="number"
                  min={0.01}
                  max={100}
                  step="any"
                  defaultValue={20}
                  required
                />
              </div>
            ) : (
              <div>
                <Label htmlFor="amountOffRupees">Rupees off</Label>
                <Input
                  id="amountOffRupees"
                  name="amountOffRupees"
                  type="number"
                  min={1}
                  step={1}
                  defaultValue={500}
                  required
                />
              </div>
            )}
            <div>
              <Label htmlFor="minPurchaseRupees">Minimum purchase</Label>
              <Input
                id="minPurchaseRupees"
                name="minPurchaseRupees"
                type="number"
                min={0}
                step={100}
                defaultValue={5000}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="validFrom">Valid from</Label>
              <Input id="validFrom" name="validFrom" type="date" defaultValue={today()} required />
            </div>
            <div>
              <Label htmlFor="validTo">Valid to</Label>
              <Input id="validTo" name="validTo" type="date" defaultValue={inDays(30)} required />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="startNumber">Start number</Label>
              <Input
                id="startNumber"
                name="startNumber"
                type="number"
                min={0}
                value={startNumber}
                onChange={(e) => setStartNumber(Number(e.target.value) || 0)}
                className="font-mono"
              />
            </div>
            <div>
              <Label htmlFor="count">How many</Label>
              <Input
                id="count"
                name="count"
                type="number"
                min={1}
                max={2000}
                value={count}
                onChange={(e) => setCount(Number(e.target.value) || 1)}
                className="font-mono"
              />
            </div>
          </div>

          <div className="rounded-card bg-surface-sunken px-3 py-2">
            <p className="text-2xs uppercase tracking-wide text-text-muted">Codes to be created</p>
            <p className="font-mono text-sm">
              {sample(startNumber)} &hellip; {sample(startNumber + count - 1)}
            </p>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" name="notes" placeholder="Optional" />
          </div>

          {error && <FieldError>{error}</FieldError>}

          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="lg" disabled={pending}>
              {pending ? "Generating…" : `Generate ${count} coupons`}
            </Button>
            <Button type="button" variant="ghost" size="lg" onClick={() => router.push(ROUTES.coupons)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
