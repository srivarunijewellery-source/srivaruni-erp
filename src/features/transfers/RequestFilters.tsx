"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { ROUTES } from "@/config/nav";

/**
 * Filters live in the URL rather than component state, so a picker can
 * send "the bangles list" to someone else and have them see the same
 * screen. Also survives the page revalidating after every tile tap.
 */
export function RequestFilters({
  transferId,
  categories,
  query,
  category,
}: {
  transferId: string;
  categories: string[];
  query: string;
  category: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(query);

  function apply(next: { q?: string; category?: string }) {
    const params = new URLSearchParams();
    const nq = next.q ?? q;
    const nc = next.category ?? category;
    if (nq.trim()) params.set("q", nq.trim());
    if (nc) params.set("category", nc);

    const qs = params.toString();
    router.push(`${ROUTES.transferDetail(transferId)}${qs ? `?${qs}` : ""}`);
  }

  return (
    <Card>
      <CardBody>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply({});
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="min-w-48 flex-1">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or barcode"
              aria-label="Search stock"
            />
          </div>
          <Select
            value={category}
            onChange={(e) => apply({ category: e.target.value })}
            aria-label="Category"
            className="w-auto min-w-40"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {(query || category) && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQ("");
                router.push(ROUTES.transferDetail(transferId));
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
