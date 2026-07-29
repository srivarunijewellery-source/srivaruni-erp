"use client";

import { useState, useTransition } from "react";
import { saveVendor } from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import type { VendorDetail } from "./queries";

/** GST state codes. The first two digits of a GSTIN decide IGST versus
 *  CGST/SGST, so showing the state name makes a wrong one obvious. */
const STATES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
  "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi",
  "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
  "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
  "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam",
  "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
  "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra",
  "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala",
  "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar",
  "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
  "97": "Other Territory",
};

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function StateHint({ gstin, disabled }: { gstin: string; disabled: boolean }) {
  if (disabled) {
    return (
      <p className="mt-1 text-2xs text-text-muted">
        Unregistered vendors have no GSTIN and no state.
      </p>
    );
  }
  if (gstin.length < 2) {
    return (
      <p className="mt-1 text-2xs text-text-muted">
        The first two digits set the state, which decides IGST versus CGST/SGST.
      </p>
    );
  }

  const code = gstin.slice(0, 2);
  const state = STATES[code];
  const valid = GSTIN_RE.test(gstin);

  if (!state) {
    return (
      <p className="mt-1 text-2xs text-status-danger-fg">
        {code} is not a valid GST state code.
      </p>
    );
  }

  return (
    <p className="mt-1 text-2xs">
      <span className={state === "Telangana" ? "text-status-done-fg" : "text-status-approved-fg"}>
        {code} · {state}
      </span>
      <span className="text-text-muted">
        {" "}
        {state === "Telangana" ? "· CGST + SGST" : "· interstate, IGST"}
      </span>
      {gstin.length === 15 && !valid && (
        <span className="block text-status-danger-fg">
          Does not match the GSTIN format.
        </span>
      )}
    </p>
  );
}

const PRICE_MODES = [
  {
    value: "no_gst",
    label: "Does not charge GST",
    hint: "Cash bill or bill of supply. The whole amount is your cost.",
  },
  {
    value: "gst_exclusive",
    label: "Price excludes GST, added at the end",
    hint: "Formal invoice. Tax is added on top of the quoted rate.",
  },
  {
    value: "gst_inclusive",
    label: "Price already includes GST",
    hint: "All-in quote. Tax is backed out of the rate you enter.",
  },
] as const;

export function VendorForm({
  vendor,
  onDone,
}: {
  vendor?: VendorDetail;
  onDone?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [gstStatus, setGstStatus] = useState(vendor?.gstStatus ?? "unregistered");
  const [priceMode, setPriceMode] = useState(vendor?.priceMode ?? "no_gst");
  const [gstin, setGstin] = useState(vendor?.gstin ?? "");
  const [pending, start] = useTransition();

  const unregistered = gstStatus === "unregistered";

  return (
    <Card>
      <CardHeader>
        <h2 className="font-medium">{vendor ? "Edit vendor" : "New vendor"}</h2>
      </CardHeader>
      <CardBody>
        <form
          action={(fd) =>
            start(async () => {
              setError(null);
              const result = await saveVendor(fd);
              if (result.ok) onDone?.();
              else setError(result.error);
            })
          }
          className="space-y-4"
        >
          {vendor && <input type="hidden" name="id" value={vendor.id} />}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Vendor name</Label>
              <Input id="name" name="name" defaultValue={vendor?.name} required />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" defaultValue={vendor?.phone ?? ""} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="gstStatus">GST registration</Label>
              <Select
                id="gstStatus"
                name="gstStatus"
                value={gstStatus}
                onChange={(e) => {
                  const next = e.target.value as typeof gstStatus;
                  setGstStatus(next);
                  if (next === "unregistered") setPriceMode("no_gst");
                }}
              >
                <option value="unregistered">Unregistered</option>
                <option value="composition">Composition scheme</option>
                <option value="registered">Registered</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="gstin">GSTIN</Label>
              <Input
                id="gstin"
                name="gstin"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                maxLength={15}
                disabled={unregistered}
                placeholder={unregistered ? "Not applicable" : "08AAACJ1234A1ZQ"}
                className="font-mono uppercase"
              />
              <StateHint gstin={gstin} disabled={unregistered} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" defaultValue={vendor?.city ?? ""} />
            </div>
            <div>
              <Label htmlFor="placeOfBusiness">Place of business</Label>
              <Input
                id="placeOfBusiness"
                name="placeOfBusiness"
                defaultValue={vendor?.placeOfBusiness ?? ""}
                placeholder="Johari Bazaar, Jaipur"
              />
            </div>
          </div>

          <fieldset>
            <Label>How this vendor quotes a price</Label>
            <div className="space-y-2">
              {PRICE_MODES.map((m) => {
                const blocked = unregistered && m.value !== "no_gst";
                return (
                  <label
                    key={m.value}
                    className={`flex gap-2 rounded-control border p-2 ${
                      priceMode === m.value ? "border-brand bg-brand-subtle" : "border-border"
                    } ${blocked ? "opacity-40" : "cursor-pointer"}`}
                  >
                    <input
                      type="radio"
                      name="priceMode"
                      value={m.value}
                      checked={priceMode === m.value}
                      disabled={blocked}
                      onChange={() => setPriceMode(m.value)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-medium">{m.label}</span>
                      <span className="block text-2xs text-text-muted">{m.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="defaultGstRate">Default tax rate (%)</Label>
              <Input
                id="defaultGstRate"
                name="defaultGstRate"
                inputMode="decimal"
                defaultValue={vendor?.defaultGstRate ?? 3}
                className="tnum"
              />
              <p className="mt-1 text-2xs text-text-muted">
                3% for imitation jewellery. Confirm with your CA.
              </p>
            </div>
            <div>
              <Label htmlFor="paymentTermsDays">Payment terms (days)</Label>
              <Input
                id="paymentTermsDays"
                name="paymentTermsDays"
                inputMode="numeric"
                defaultValue={vendor?.paymentTermsDays ?? 0}
                className="tnum"
              />
            </div>
          </div>

          {error && <FieldError>{error}</FieldError>}

          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Saving…" : vendor ? "Save changes" : "Add vendor"}
            </Button>
            {onDone && (
              <Button type="button" variant="ghost" onClick={onDone}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
