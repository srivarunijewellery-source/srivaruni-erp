"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { savePrintSettings } from "./actions";
import type { PrintConfig } from "./queries";

/**
 * How the slip prints.
 *
 * These are settings rather than constants because the right values
 * depend on the printer in front of you — paper width, how much of it is
 * actually printable, and how hard the head burns all vary. The only way
 * to find them is to print one and look, so the form exists to make that
 * loop quick.
 */
export function PrintSettingsForm({ config }: { config: PrintConfig }) {
  const [f, setF] = useState(config);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof PrintConfig>(k: K, v: PrintConfig[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  function save() {
    start(async () => {
      setError(null);
      setMsg(null);
      const r = await savePrintSettings({
        paper_mm: f.paperMm,
        print_width_mm: f.printWidthMm,
        side_margin_mm: f.sideMarginMm,
        base_font_px: f.baseFontPx,
        bold_body: f.boldBody,
        show_savings: f.showSavings,
        show_gst_block: f.showGstBlock,
        show_barcode: f.showBarcode,
        footer_feed_mm: f.footerFeedMm,
        layout: f.layout,
        font_family: f.fontFamily,
        masthead_name: f.mastheadName ?? "",
        tagline: f.tagline ?? "",
        show_tagline: f.showTagline,
        address_font_px: f.addressFontPx,
        item_font_px: f.itemFontPx,
        signature_line: f.signatureLine ?? "",
        show_signature: f.showSignature,
        qr_url: f.qrUrl ?? "",
        qr_caption: f.qrCaption ?? "",
        qr_handle: f.qrHandle ?? "",
      });
      if (r.ok) setMsg("Saved. Print one and check it.");
      else setError(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="font-medium">The name at the top</CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="mast">Masthead</Label>
            <Input
              id="mast"
              value={f.mastheadName ?? ""}
              onChange={(e) => set("mastheadName", e.target.value)}
              placeholder="Sri Varuni"
            />
            <p className="mt-1 text-2xs text-text-muted">
              Branding, not the legal name. The full registered name still prints
              on the invoice for GST — putting both in the masthead is what caused
              &ldquo;Sri Varuni Fashion Jewellery&rdquo; over &ldquo;FASHION
              JEWELLERY&rdquo;.
            </p>
          </div>
          <div>
            <Label htmlFor="tag">Line under it</Label>
            <Input
              id="tag"
              value={f.tagline ?? ""}
              onChange={(e) => set("tagline", e.target.value)}
              placeholder="FASHION JEWELLERY"
            />
            <div className="mt-2">
              <Toggle
                label="Show that line"
                checked={f.showTagline ?? true}
                onChange={(v) => set("showTagline", v)}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="font-medium">Look</CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="font">Typeface</Label>
            <Select
              id="font"
              value={f.fontFamily}
              onChange={(e) =>
                set("fontFamily", e.target.value as PrintConfig["fontFamily"])
              }
            >
              <option value="editorial">Editorial — serif name, clean body</option>
              <option value="grotesk">Modern — heavy caps, compact</option>
              <option value="mono">Classic — typewriter throughout</option>
            </Select>
            <p className="mt-1 text-2xs text-text-muted">
              Only the money column is monospaced in the first two, so amounts
              still line up while names read like type.
            </p>
          </div>

          <div>
            <Label htmlFor="layout">How much detail</Label>
            <Select
              id="layout"
              value={f.layout}
              onChange={(e) => set("layout", e.target.value as PrintConfig["layout"])}
            >
              <option value="standard">Standard</option>
              <option value="compact">Compact — shortest slip</option>
              <option value="detailed">Detailed — everything</option>
            </Select>
          </div>

          <Toggle
            label="Bold body text"
            hint="A thermal head under-burns thin strokes, so this is the single biggest legibility win."
            checked={f.boldBody}
            onChange={(v) => set("boldBody", v)}
          />
          <Toggle
            label="Show the savings box"
            hint="&ldquo;You saved ₹324 on this bill&rdquo;"
            checked={f.showSavings}
            onChange={(v) => set("showSavings", v)}
          />
          <Toggle
            label="Show the GST breakdown"
            hint="Taxable value, CGST and SGST as separate lines."
            checked={f.showGstBlock}
            onChange={(v) => set("showGstBlock", v)}
          />
          <Toggle
            label="Show the QR"
            checked={f.showBarcode}
            onChange={(v) => set("showBarcode", v)}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="font-medium">Credit line</CardHeader>
        <CardBody className="space-y-2">
          <div>
            <Label htmlFor="sig">Printed small and italic at the foot</Label>
            <Input
              id="sig"
              value={f.signatureLine ?? ""}
              onChange={(e) => set("signatureLine", e.target.value)}
            />
          </div>
          <Toggle
            label="Show it"
            checked={f.showSignature ?? true}
            onChange={(v) => set("showSignature", v)}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="font-medium">The QR</CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="qrurl">Where it points</Label>
            <Input
              id="qrurl"
              value={f.qrUrl ?? ""}
              onChange={(e) => set("qrUrl", e.target.value)}
              placeholder="https://www.instagram.com/..."
            />
            <p className="mt-1 text-2xs text-text-muted">
              Test it after changing. A QR pointing at a dead link is worse than
              no QR at all.
            </p>
          </div>
          <div>
            <Label htmlFor="qrcap">Caption</Label>
            <Input
              id="qrcap"
              value={f.qrCaption ?? ""}
              onChange={(e) => set("qrCaption", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="qrh">Handle shown under it</Label>
            <Input
              id="qrh"
              value={f.qrHandle ?? ""}
              onChange={(e) => set("qrHandle", e.target.value)}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="font-medium">Fit on the paper</CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Num label="Paper width (mm)" value={f.paperMm} onChange={(v) => set("paperMm", v)} />
          <Num
            label="Printable width (mm)"
            value={f.printWidthMm}
            onChange={(v) => set("printWidthMm", v)}
            hint="Always less than the paper."
          />
          <Num
            label="Side margin (mm)"
            value={f.sideMarginMm}
            onChange={(v) => set("sideMarginMm", v)}
            hint="Below about 2mm the edges clip."
          />
          <Num label="Font size (px)" value={f.baseFontPx} onChange={(v) => set("baseFontPx", v)} />
          <Num
            label="Item name size (px)"
            value={f.itemFontPx ?? 13}
            onChange={(v) => set("itemFontPx", v)}
          />
          <Num
            label="Address size (px)"
            value={f.addressFontPx ?? 10}
            onChange={(v) => set("addressFontPx", v)}
            hint="Reference, not reading matter."
          />
          <Num
            label="Feed after the slip (mm)"
            value={f.footerFeedMm}
            onChange={(v) => set("footerFeedMm", v)}
            hint="So the tear-off misses the last line."
          />
        </CardBody>
      </Card>

      <FieldError>{error}</FieldError>
      {msg && <p className="text-sm text-status-done-fg">{msg}</p>}

      <Button variant="primary" onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-[var(--color-brand)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {hint && <span className="block text-2xs text-text-muted">{hint}</span>}
      </span>
    </label>
  );
}

function Num({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div>
      <Label htmlFor={label}>{label}</Label>
      <Input
        id={label}
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="font-mono"
      />
      {hint && <p className="mt-1 text-2xs text-text-muted">{hint}</p>}
    </div>
  );
}
