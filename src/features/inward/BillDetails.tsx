"use client";

import { useState, useTransition } from "react";
import { updateInwardHeader } from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { formatDateTime } from "@/lib/format";
import type { VendorOption } from "@/types/domain";

/**
 * Document facts, read-only by default with an explicit Edit.
 *
 * A record document should look like a record. Fields that are always
 * live invite accidental edits on a document someone is only reading.
 */
export function BillDetails({
  inwardId,
  vendorId,
  vendorName,
  invoiceNo,
  invoiceDate,
  createdAt,
  submittedAt,
  approvedAt,
  rejectedReason,
  vendors,
}: {
  inwardId: string;
  vendorId: string;
  vendorName: string;
  invoiceNo: string | null;
  invoiceDate: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  vendors: VendorOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">Document</h2>
          {!editing && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardBody className="space-y-2 text-sm">
        {editing ? (
          <form
            action={(fd) =>
              start(async () => {
                setError(null);
                fd.set("inwardId", inwardId);
                const result = await updateInwardHeader(fd);
                if (result.ok) setEditing(false);
                else setError(result.error);
              })
            }
            className="space-y-3"
          >
            <div>
              <Label htmlFor="vendorId">Vendor</Label>
              <Select id="vendorId" name="vendorId" defaultValue={vendorId} required>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.city ? ` · ${v.city}` : ""}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-2xs text-text-muted">
                Changing the vendor recalculates tax from their setup.
              </p>
            </div>
            <div>
              <Label htmlFor="vendorInvoiceNo">Bill number</Label>
              <Input
                id="vendorInvoiceNo"
                name="vendorInvoiceNo"
                defaultValue={invoiceNo ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="vendorInvoiceDate">Bill date</Label>
              <Input
                id="vendorInvoiceDate"
                name="vendorInvoiceDate"
                type="date"
                defaultValue={invoiceDate ?? ""}
              />
            </div>
            {error && <FieldError>{error}</FieldError>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="primary" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <Row label="Vendor" value={vendorName} />
            <Row label="Bill number" value={invoiceNo ?? "—"} />
            <Row label="Bill date" value={invoiceDate ?? "—"} />
            <Row label="Created" value={formatDateTime(createdAt)} />
            <Row label="Submitted" value={formatDateTime(submittedAt)} />
            <Row label="Approved" value={formatDateTime(approvedAt)} />
            {rejectedReason && (
              <p className="rounded-control bg-status-danger-bg p-2 text-status-danger-fg">
                Sent back: {rejectedReason}
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-text-muted">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
