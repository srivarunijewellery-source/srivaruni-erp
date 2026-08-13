"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Field";
import { fetchReport } from "./actions";
import type { ReportDef, ReportRow } from "./queries";
import { isoOf, todayIso } from "@/lib/dates";

/**
 * Pick a report, a window, and the columns you want. Look at it, take it
 * away.
 *
 * One runner for every report rather than a page each: the shape of the
 * task is identical across sales, GST and inventory, and building it
 * fifteen times would guarantee fifteen slightly different behaviours.
 */
export function ReportRunner({
  catalog,
  branches,
}: {
  catalog: ReportDef[];
  branches: Array<{ id: string; code: string; name: string }>;
}) {
  const today = todayIso();
  const monthStart = new Date();
  monthStart.setDate(1);

  const [key, setKey] = useState(catalog[0]?.key ?? "");
  const [from, setFrom] = useState(isoOf(monthStart));
  const [to, setTo] = useState(today);
  const [branch, setBranch] = useState("");
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const def = catalog.find((c) => c.key === key);
  const groups = useMemo(() => {
    const g = new Map<string, ReportDef[]>();
    for (const c of catalog) {
      if (!g.has(c.group)) g.set(c.group, []);
      g.get(c.group)!.push(c);
    }
    return [...g.entries()];
  }, [catalog]);

  const cols = (def?.cols ?? []).filter((c) => !hidden.has(c));

  function run() {
    start(async () => {
      setError(null);
      const r = await fetchReport(key, from, to, branch || null);
      if (r.ok) setRows(r.data);
      else setError(r.error);
    });
  }

  /** CSV, escaped properly — a jewellery name with a comma in it should
   *  not silently shift every column after it. */
  function download() {
    if (!rows || rows.length === 0) return;
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      cols.join(","),
      ...rows.map((r) => cols.map((c) => esc(r[c])).join(",")),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${key}_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const preset = (days: number) => {
    const end = new Date();
    const st = new Date();
    st.setDate(st.getDate() - days);
    setFrom(isoOf(st));
    setTo(isoOf(end));
  };

  const isMoney = (c: string) =>
    /total|revenue|margin|cost|value|debit|credit|taxable|gst|price|discount|tax/i.test(c);

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <div className="space-y-3">
        {groups.map(([group, items]) => (
          <Card key={group}>
            <CardHeader className="text-2xs font-medium uppercase tracking-wide text-text-muted">
              {group}
            </CardHeader>
            <CardBody className="p-0">
              <ul className="divide-y divide-border">
                {items.map((r) => (
                  <li key={r.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setKey(r.key);
                        setRows(null);
                        setHidden(new Set());
                      }}
                      className={`w-full px-3 py-2 text-left hover:bg-surface-sunken ${
                        key === r.key ? "bg-brand-subtle" : ""
                      }`}
                    >
                      <span
                        className={`block text-sm ${key === r.key ? "font-medium text-brand" : ""}`}
                      >
                        {r.label}
                      </span>
                      <span className="block text-2xs text-text-muted">{r.desc}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        <Card>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="rf">From</Label>
                <Input id="rf" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
              </div>
              <div>
                <Label htmlFor="rt">To</Label>
                <Input id="rt" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
              </div>
              {branches.length > 1 && (
                <div>
                  <Label htmlFor="rb">Branch</Label>
                  <Select id="rb" value={branch} onChange={(e) => setBranch(e.target.value)} className="w-40">
                    <option value="">All</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.code}</option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="flex gap-1.5">
                {([["7 days", 7], ["30 days", 30], ["90 days", 90], ["Year", 365]] as const).map(
                  ([l, d]) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => preset(d)}
                      className="rounded-control border border-border px-2.5 py-1.5 text-2xs hover:border-brand hover:text-brand"
                    >
                      {l}
                    </button>
                  ),
                )}
              </div>
              <Button variant="primary" onClick={run} disabled={pending || !key}>
                {pending ? "Running…" : "Run"}
              </Button>
              <Button variant="secondary" onClick={download} disabled={!rows || rows.length === 0}>
                Download CSV
              </Button>
            </div>

            {def && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
                <span className="text-2xs text-text-muted">Columns</span>
                {def.cols.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() =>
                      setHidden((p) => {
                        const n = new Set(p);
                        if (n.has(c)) n.delete(c);
                        else n.add(c);
                        return n;
                      })
                    }
                    className={`rounded-full border px-2 py-0.5 text-2xs ${
                      hidden.has(c)
                        ? "border-border text-text-subtle line-through"
                        : "border-brand text-brand"
                    }`}
                  >
                    {c.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {error && <p className="text-sm text-status-danger-fg">{error}</p>}

        {rows && (
          <Card>
            <CardHeader className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{def?.label}</span>
              <span className="text-2xs text-text-muted">
                {rows.length} row{rows.length === 1 ? "" : "s"}
                {rows.length > 500 && " · 500 shown below, all in the CSV"}
                {rows.length >= 20000 && " · capped, narrow the window"}
              </span>
            </CardHeader>
            <CardBody className="p-0">
              {rows.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-text-muted">
                  Nothing in this window.
                </p>
              ) : (
                <div className="max-h-[34rem] overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 bg-surface-sunken">
                      <tr className="border-b border-border">
                        {cols.map((c) => (
                          <th
                            key={c}
                            className={`px-3 py-2 text-2xs font-medium uppercase tracking-wide text-text-muted ${
                              isMoney(c) ? "text-right" : "text-left"
                            }`}
                          >
                            {c.replace(/_/g, " ")}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 500).map((r, i) => (
                        <tr key={i} className="border-b border-border">
                          {cols.map((c) => (
                            <td
                              key={c}
                              className={`px-3 py-1.5 ${
                                isMoney(c) ? "tnum text-right font-mono text-2xs" : "text-2xs"
                              }`}
                            >
                              {r[c] === null || r[c] === undefined
                                ? "—"
                                : isMoney(c) && typeof r[c] === "number"
                                  ? // Whole rupees on screen, like every
                                    // other surface. The CSV download
                                    // above is deliberately NOT rounded:
                                    // that file gets reconciled against
                                    // the books, and books are exact.
                                    Number(r[c]).toLocaleString("en-IN", {
                                      maximumFractionDigits: 0,
                                    })
                                  : String(r[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 500 && (
                    <p className="px-3 py-2 text-2xs text-text-subtle">
                      Showing the first 500 here so the page stays quick. The
                      CSV download contains all {rows.length} rows.
                    </p>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
