"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Field";
import { saveLabourRate } from "./actions";

/** Sits on the assembly page rather than buried in settings: it is only
 *  ever changed in the context of costing a piece. */
export function LabourRateCard({ ratePaise }: { ratePaise: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState((ratePaise / 100).toString());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <Card>
      <CardBody className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="labour-rate">Labour rate per hour</Label>
          <Input
            id="labour-rate"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            className="h-11 w-32 sm:h-9"
          />
        </div>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const r = await saveLabourRate(value);
              if (!r.ok) setError(r.error);
              else {
                setSaved(true);
                router.refresh();
              }
            });
          }}
        >
          {pending ? "Saving…" : "Save rate"}
        </Button>
        <p className="pb-2 text-2xs text-text-muted">
          {saved ? "Saved. " : ""}Assemblies already started keep the rate they
          were created with.
        </p>
        {error && <FieldError>{error}</FieldError>}
      </CardBody>
    </Card>
  );
}
