"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { ROUTES } from "@/config/nav";

/**
 * Search lives in the URL so a lookup can be handed to someone else, and
 * so the result survives adding a customer and coming back.
 */
export function CustomerSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  return (
    <Card>
      <CardBody>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const term = q.trim();
            router.push(term ? `${ROUTES.customers}?q=${encodeURIComponent(term)}` : ROUTES.customers);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, or any part of a phone number"
            aria-label="Search customers"
            className="min-w-48 flex-1"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {initial && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQ("");
                router.push(ROUTES.customers);
              }}
            >
              Clear
            </Button>
          )}
        </form>
      </CardBody>
    </Card>
  );
}
