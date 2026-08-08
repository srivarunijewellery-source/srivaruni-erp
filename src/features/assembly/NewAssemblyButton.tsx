"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Field";
import { startAssembly } from "./actions";

export function NewAssemblyButton({
  stores,
}: {
  stores: Array<{ id: string; code: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [locationId, setLocationId] = useState(stores[0]?.id ?? "");

  function go() {
    setError(null);
    start(async () => {
      const r = await startAssembly(locationId, null);
      if (!r.ok) setError(r.error);
      else router.push(`/assembly/${r.data}`);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Only asked when there is a genuine choice. One shop should not
          have to answer a question with one possible answer. */}
      {stores.length > 1 && (
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          aria-label="Branch"
          className="h-11 rounded-control border border-border bg-surface px-2 text-sm sm:h-9"
        >
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
            </option>
          ))}
        </select>
      )}
      <Button onClick={go} disabled={pending || !locationId}>
        {pending ? "Starting…" : "Start an assembly"}
      </Button>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
