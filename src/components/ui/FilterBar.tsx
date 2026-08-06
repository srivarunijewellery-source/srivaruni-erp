"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Field";

export interface FilterSelect {
  key: string;
  label: string;
  /** Shown when nothing is chosen, e.g. "All categories". */
  allLabel: string;
  options: Array<{ value: string; label: string }>;
}

/**
 * One filter bar for every list screen.
 *
 * Stock, products and sales each grew a lone search box and nothing
 * else, so finding "everything in ZHB" meant scrolling. Each page was
 * about to hand-roll its own row of selects; this is that row, once.
 *
 * State lives in the URL rather than in the component. Changing a filter
 * is a real navigation, so the server component refetches for the new
 * criteria, the back button works, and a filtered view can be sent to
 * someone as a link.
 */
export function FilterBar({
  basePath,
  selects,
  value,
  searchKey = "q",
  searchLabel = "Search",
  searchPlaceholder,
  extra,
}: {
  basePath: string;
  selects: FilterSelect[];
  value: Record<string, string>;
  searchKey?: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  /** A checkbox or two that do not fit the select shape. */
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const [q, setQ] = useState(value[searchKey] ?? "");

  function apply(next: Record<string, string>) {
    const merged = { ...value, ...next };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  const anySet = Object.entries(value).some(([, v]) => Boolean(v));

  return (
    <Card className="mb-4">
      <CardBody className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {selects.map((s) => (
            <div key={s.key}>
              <Label htmlFor={`f-${s.key}`}>{s.label}</Label>
              <Select
                id={`f-${s.key}`}
                value={value[s.key] ?? ""}
                onChange={(e) => apply({ [s.key]: e.target.value })}
                disabled={s.options.length === 0}
              >
                <option value="">
                  {s.options.length === 0 ? "Nothing to filter by" : s.allLabel}
                </option>
                {s.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply({ [searchKey]: q.trim() });
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="min-w-48 flex-1">
            <Label htmlFor="filter-q">{searchLabel}</Label>
            <Input
              id="filter-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>

          {extra}

          {anySet && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQ("");
                router.push(basePath);
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
