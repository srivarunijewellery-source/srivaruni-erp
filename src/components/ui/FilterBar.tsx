"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
  // Filtering re-renders on the server, which takes a beat. Without a
  // pending state nothing on screen changes and it reads as broken --
  // people click again, which queues another render and makes it worse.
  const [pending, startTransition] = useTransition();

  function apply(next: Record<string, string>) {
    const merged = { ...value, ...next };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${basePath}?${qs}` : basePath));
  }

  const anySet = Object.entries(value).some(([, v]) => Boolean(v));

  return (
    <Card className="mb-4">
      <CardBody className="space-y-3">
        {pending && (
          <div
            aria-live="polite"
            className="flex items-center gap-2 rounded-control bg-surface-sunken px-3 py-1.5 text-2xs text-text-muted"
          >
            <span className="size-2 animate-pulse rounded-full bg-brand" />
            Filtering…
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* A dropdown with nothing in it is not a filter, it is a dead
              control taking up a slot. Dropped unless it is currently
              holding a value, in which case it has to stay so the value
              can be cleared. */}
          {selects
            .filter((s) => s.options.length > 0 || value[s.key])
            .map((s) => (
            <div key={s.key}>
              <Label htmlFor={`f-${s.key}`}>{s.label}</Label>
              <Select
                id={`f-${s.key}`}
                value={value[s.key] ?? ""}
                onChange={(e) => apply({ [s.key]: e.target.value })}
                disabled={pending}
              >
                <option value="">{s.allLabel}</option>
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
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Searching…" : "Search"}
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
