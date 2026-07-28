"use client";

import { useState } from "react";
import { VendorForm } from "./VendorForm";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { ROUTES } from "@/config/nav";
import type { VendorDetail } from "./queries";

const MODE_LABEL = {
  no_gst: "No GST",
  gst_exclusive: "GST added",
  gst_inclusive: "GST included",
} as const;

const MODE_TONE = {
  no_gst: "neutral",
  gst_exclusive: "approved",
  gst_inclusive: "transit",
} as const;

export function VendorList({ vendors }: { vendors: VendorDetail[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      {creating ? (
        <VendorForm onDone={() => setCreating(false)} />
      ) : (
        <Button variant="primary" onClick={() => setCreating(true)}>
          Add vendor
        </Button>
      )}

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-sunken">
              {["Vendor", "Place", "GSTIN", "Pricing", "Tax", "Terms", ""].map((h) => (
                <th
                  key={h}
                  className="px-2 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-text-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <>
                <tr key={v.id} className="border-b border-border last:border-0">
                  <td className="px-2 py-1.5 font-medium">
                    <Link href={ROUTES.vendorDetail(v.id)} className="hover:text-brand">
                      {v.name}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 text-text-muted">
                    {v.placeOfBusiness ?? v.city ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-2xs">{v.gstin ?? "—"}</td>
                  <td className="px-2 py-1.5">
                    <Badge tone={MODE_TONE[v.priceMode]}>{MODE_LABEL[v.priceMode]}</Badge>
                  </td>
                  <td className="tnum px-3 py-2.5">
                    {v.priceMode === "no_gst" ? "—" : `${v.defaultGstRate}%`}
                  </td>
                  <td className="tnum px-3 py-2.5">
                    {v.paymentTermsDays === 0 ? "Cash" : `${v.paymentTermsDays}d`}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Link
                      href={ROUTES.vendorDetail(v.id)}
                      className="text-sm text-brand hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
                {editing === v.id && (
                  <tr key={`${v.id}-edit`}>
                    <td colSpan={7} className="bg-surface-sunken px-3 py-3">
                      <VendorForm vendor={v} onDone={() => setEditing(null)} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
