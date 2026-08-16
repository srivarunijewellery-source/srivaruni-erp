"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, FieldError } from "@/components/ui/Field";
import { searchCustomersAction } from "@/features/pos/customer-actions";
import { assignReturnCustomer } from "./actions";

/**
 * Puts a name on a return that was taken without one.
 *
 * Searches by name OR phone, because at the counter the customer is
 * standing there and might offer either — insisting on the number when
 * someone says "it was Swapna" is the kind of friction that makes staff
 * reach for a workaround instead.
 */
export function ReturnCustomerPicker({
  returnId,
  returnNo,
  current,
}: {
  returnId: string;
  returnNo: string;
  current: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<
    Array<{ id: string; name: string; phone: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open || term.trim().length < 3) {
      setHits([]);
      return;
    }
    // Debounced: a search per keystroke on a counter's connection is
    // slower than no search at all.
    const id = setTimeout(() => {
      void searchCustomersAction(term).then((r) => {
        if (r.ok) // A customer can exist with a phone and no name — showing the
          // number is better than an empty row.
          setHits(
            r.data.map((c) => ({ id: c.id, name: c.name ?? c.phone, phone: c.phone })),
          );
      });
    }, 250);
    return () => clearTimeout(id);
  }, [term, open]);

  function pick(customerId: string | null) {
    start(async () => {
      setError(null);
      const r = await assignReturnCustomer(returnId, customerId);
      if (!r.ok) setError(r.error);
      else {
        setOpen(false);
        setTerm("");
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-2xs text-brand hover:underline"
      >
        {current ? "Change customer" : "Assign a customer"}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-control border border-border p-2">
      <p className="text-2xs text-text-muted">
        Who does {returnNo} belong to? Search by name or phone.
      </p>
      <Input
        autoFocus
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Swapna, or 98765 43210"
      />

      {hits.length > 0 && (
        <ul className="max-h-48 divide-y divide-border overflow-auto rounded-control border border-border">
          {hits.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 p-2">
              <span className="min-w-0 text-2xs">
                <span className="block truncate">{c.name}</span>
                <span className="font-mono text-text-muted">{c.phone}</span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => pick(c.id)}
              >
                Choose
              </Button>
            </li>
          ))}
        </ul>
      )}

      {term.trim().length >= 3 && hits.length === 0 && (
        <p className="text-2xs text-text-muted">
          Nobody matches that. Add them under Customers first, then come back.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {current && (
          <button
            type="button"
            disabled={pending}
            onClick={() => pick(null)}
            className="text-2xs text-text-muted hover:underline"
          >
            Remove the customer
          </button>
        )}
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
