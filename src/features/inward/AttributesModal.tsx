"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Label, Select, FieldError } from "@/components/ui/Field";
import { updateItemAttributes } from "./pricingActions";
import type { ItemFormOptions } from "@/types/domain";

/** Attribute editing for one item, out of the row so the table stays dense. */
export function AttributesModal({
  itemId,
  inwardId,
  itemName,
  current,
  options,
  onClose,
}: {
  itemId: string;
  inwardId: string;
  itemName: string;
  current: {
    colourId: string | null;
    platingId: string | null;
    stoneId: string | null;
    sizeId: string | null;
  };
  options: ItemFormOptions;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Modal title={itemName} onClose={onClose} width="max-w-lg">
      <form
        action={(fd) =>
          start(async () => {
            setError(null);
            fd.set("itemId", itemId);
            fd.set("inwardId", inwardId);
            const r = await updateItemAttributes(fd);
            if (r.ok) onClose();
            else setError(r.error);
          })
        }
        className="space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field name="colourId"  label="Colour"  value={current.colourId}  opts={options.colours} />
          <Field name="platingId" label="Plating" value={current.platingId} opts={options.platings} />
          <Field name="stoneId"   label="Stone"   value={current.stoneId}   opts={options.stones} />
          <Field name="sizeId"    label="Size"    value={current.sizeId}    opts={options.sizes} />
        </div>
        {error && <FieldError>{error}</FieldError>}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : "Save attributes"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  name,
  label,
  value,
  opts,
}: {
  name: string;
  label: string;
  value: string | null;
  opts: Array<{ id: string; value: string }>;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Select id={name} name={name} defaultValue={value ?? ""}>
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o.id} value={o.id}>{o.value}</option>
        ))}
      </Select>
    </div>
  );
}
