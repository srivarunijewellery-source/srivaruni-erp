"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Field";

/**
 * The window everything on the dashboard is measured over.
 *
 * This was missing entirely: the page read `from` and `to` off the URL
 * but never rendered a control to set them, so the only window available
 * was whatever the default happened to be. Asking "what sold this week"
 * was impossible without hand-editing the address bar.
 *
 * Presets first, because a date pair is a fiddly way to say "yesterday".
 */
export function DateRangeBar({
  basePath,
  params,
  from,
  to,
}: {
  basePath: string;
  /** Everything else in the URL, preserved so a preset does not wipe the
   *  tab you are on or the filters you set. */
  params: Record<string, string>;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const iso = (d: Date) => d.toISOString().slice(0, 10);

  function go(nextFrom: string, nextTo: string) {
    const merged = { ...params, from: nextFrom, to: nextTo, page: "" };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
    start(() => router.push(`${basePath}?${qs.toString()}`));
  }

  function preset(days: number) {
    const end = new Date();
    const startD = new Date();
    startD.setDate(startD.getDate() - days);
    go(iso(startD), iso(end));
  }

  function thisMonth() {
    const now = new Date();
    go(iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(now));
  }

  const PRESETS: Array<[string, () => void]> = [
    ["Today", () => preset(0)],
    ["7 days", () => preset(7)],
    ["30 days", () => preset(30)],
    ["This month", thisMonth],
    ["12 months", () => preset(365)],
  ];

  return (
    <Card className="mb-4">
      <CardBody className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="dash-from">From</Label>
          <Input
            id="dash-from"
            type="date"
            value={from}
            disabled={pending}
            onChange={(e) => go(e.target.value, to)}
            className="w-40"
          />
        </div>
        <div>
          <Label htmlFor="dash-to">To</Label>
          <Input
            id="dash-to"
            type="date"
            value={to}
            disabled={pending}
            onChange={(e) => go(from, e.target.value)}
            className="w-40"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(([label, fn]) => (
            <button
              key={label}
              type="button"
              disabled={pending}
              onClick={fn}
              className="rounded-control border border-border px-3 py-1.5 text-2xs hover:border-brand hover:text-brand disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>

        {pending && (
          <span className="flex items-center gap-1.5 text-2xs text-text-muted">
            <span className="size-2 animate-pulse rounded-full bg-brand" />
            Loading…
          </span>
        )}
      </CardBody>
    </Card>
  );
}
