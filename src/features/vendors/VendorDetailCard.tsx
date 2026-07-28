"use client";

import { DetailShell, Fact } from "@/components/ui/DetailShell";
import { VendorForm } from "./VendorForm";
import { Tag } from "@/components/ui/Tag";
import type { VendorDetail } from "./queries";

const MODE_LABEL = {
  no_gst: "Does not charge GST",
  gst_exclusive: "Price excludes GST, added at end",
  gst_inclusive: "Price includes GST",
} as const;

export function VendorDetailCard({ vendor }: { vendor: VendorDetail }) {
  return (
    <DetailShell
      title="Vendor details"
      view={
        <div className="space-y-0">
          <Fact label="Name" value={vendor.name} />
          <Fact label="Phone" value={vendor.phone ?? "—"} />
          <Fact label="Place of business" value={vendor.placeOfBusiness ?? "—"} />
          <Fact label="City" value={vendor.city ?? "—"} />
          <Fact
            label="GST status"
            value={<Tag>{vendor.gstStatus}</Tag>}
          />
          <Fact
            label="GSTIN"
            value={<span className="font-mono text-2xs">{vendor.gstin ?? "—"}</span>}
          />
          <Fact label="Pricing" value={MODE_LABEL[vendor.priceMode]} />
          <Fact
            label="Default tax"
            value={vendor.priceMode === "no_gst" ? "—" : `${vendor.defaultGstRate}%`}
          />
          <Fact
            label="Payment terms"
            value={vendor.paymentTermsDays === 0 ? "Cash" : `${vendor.paymentTermsDays} days`}
          />
        </div>
      }
      edit={(done) => <VendorForm vendor={vendor} onDone={done} />}
    />
  );
}
