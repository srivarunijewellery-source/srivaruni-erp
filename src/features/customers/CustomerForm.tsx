"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Field";
import { saveCustomer } from "./actions";
import { ROUTES } from "@/config/nav";
import type { Customer } from "./queries";

/**
 * One form for both new and existing customers.
 *
 * Every field is submitted every time, including blanks, because
 * upsert_customer is a full replace rather than a patch -- that is what
 * makes a mistyped PAN or date of birth clearable rather than permanent.
 */
export function CustomerForm({ customer }: { customer?: Customer }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    start(async () => {
      setError(null);
      const result = await saveCustomer(formData);
      if (result.ok) router.push(ROUTES.customerDetail(result.data));
      else setError(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <span className="font-medium">{customer ? "Edit details" : "New customer"}</span>
      </CardHeader>
      <CardBody>
        <form action={submit} className="space-y-4">
          {customer && <input type="hidden" name="id" value={customer.id} />}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                required
                defaultValue={customer?.phone ?? ""}
                placeholder="98765 43210"
                className="font-mono"
                inputMode="tel"
              />
              <p className="mt-0.5 text-2xs text-text-subtle">
                The customer&rsquo;s identity here. +91, spaces and dashes are fine &mdash;
                they get stripped so the same person can&rsquo;t end up twice.
              </p>
            </div>
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={customer?.name ?? ""} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={customer?.email ?? ""}
                placeholder="optional"
              />
            </div>
            <div>
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" defaultValue={customer?.city ?? ""} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="dob">Date of birth</Label>
              <Input id="dob" name="dob" type="date" defaultValue={customer?.dob ?? ""} />
            </div>
            <div>
              <Label htmlFor="anniversary">Anniversary</Label>
              <Input
                id="anniversary"
                name="anniversary"
                type="date"
                defaultValue={customer?.anniversary ?? ""}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="gstin">GSTIN</Label>
              <Input
                id="gstin"
                name="gstin"
                defaultValue={customer?.gstin ?? ""}
                placeholder="For a business buyer"
                className="font-mono uppercase"
              />
            </div>
            <div>
              <Label htmlFor="pan">PAN</Label>
              <Input
                id="pan"
                name="pan"
                defaultValue={customer?.pan ?? ""}
                placeholder="ABCDE1234F"
                className="font-mono uppercase"
              />
              <p className="mt-0.5 text-2xs text-text-subtle">
                Required by law on high-value bills. Worth capturing early rather than
                chasing at the counter.
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              name="notes"
              defaultValue={customer?.notes ?? ""}
              placeholder="Preferences, sizes, anything worth remembering next visit"
            />
          </div>

          {error && <FieldError>{error}</FieldError>}

          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="lg" disabled={pending}>
              {pending ? "Saving…" : customer ? "Save changes" : "Add customer"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={() => router.push(ROUTES.customers)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
