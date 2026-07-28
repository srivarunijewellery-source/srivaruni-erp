"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInward } from "./actions";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { ROUTES } from "@/config/nav";
import type { StoreLocation, VendorOption } from "@/types/domain";

export function NewInwardForm({
  vendors,
  stores,
  defaultLocationId,
}: {
  vendors: VendorOption[];
  stores: StoreLocation[];
  defaultLocationId: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card className="max-w-xl">
      <CardBody>
        <form
          action={(fd) =>
            start(async () => {
              setError(null);
              const result = await createInward(fd);
              if (result.ok) router.push(ROUTES.inwardDetail(result.data));
              else setError(result.error);
            })
          }
          className="space-y-4"
        >
          <div>
            <Label htmlFor="locationId">Store</Label>
            <Select id="locationId" name="locationId" defaultValue={defaultLocationId ?? ""} required>
              <option value="" disabled>Choose store</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="vendorId">Vendor</Label>
            <Select id="vendorId" name="vendorId" defaultValue="" required>
              <option value="" disabled>Choose vendor</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.city ? ` · ${v.city}` : ""}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="vendorInvoiceNo">Vendor bill number</Label>
            <Input
              id="vendorInvoiceNo"
              name="vendorInvoiceNo"
              placeholder="As printed on the bill"
            />
            <p className="mt-1 text-2xs text-text-muted">
              Optional now. A photo of the bill is required before you can send this for pricing.
            </p>
          </div>

          {error && <FieldError>{error}</FieldError>}

          <Button type="submit" variant="primary" size="lg" fullWidth disabled={pending}>
            {pending ? "Opening…" : "Open document"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
