"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Label, Select, FieldError } from "@/components/ui/Field";
import { formatBps } from "@/lib/pricing";
import { savePricingSettings } from "./actions";
import type { PriceBand, PricingSettings } from "@/types/domain";

/**
 * The nudge is the interesting control here.
 *
 * Zero aims at the middle of whatever band is chosen: a 50-55% band
 * targets 52.5%. It is capped at two points either way on purpose — a
 * bigger correction than that means the wrong band is being selected,
 * and fixing it with a global offset would hide the real problem across
 * every other band at the same time.
 */
export function PricingSettingsForm({
  settings,
  bands,
}: {
  settings: PricingSettings;
  bands: PriceBand[];
}) {
  const [nudge, setNudge] = useState(String(settings.targetNudgeBps));
  const [roundMode, setRoundMode] = useState(settings.roundMode);
  const [gst, setGst] = useState(settings.marginIncludesGst);
  const [bandId, setBandId] = useState(settings.defaultBandId ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setMsg(null);
    setError(null);
    const res = await savePricingSettings({
      targetNudgeBps: Number(nudge),
      roundMode,
      marginIncludesGst: gst,
      defaultBandId: bandId || null,
    });
    setSaving(false);
    if (res.ok) setMsg("Saved."); else setError(res.error);
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-medium">Recommendation</h2>
      </CardHeader>
      <CardBody className="space-y-4">
        <div>
          <Label htmlFor="nudge">Aim within the band</Label>
          <Select id="nudge" value={nudge} onChange={(e) => setNudge(e.target.value)}>
            <option value="-200">2 points below the midpoint</option>
            <option value="-100">1 point below the midpoint</option>
            <option value="0">Dead centre</option>
            <option value="100">1 point above the midpoint</option>
            <option value="200">2 points above the midpoint</option>
          </Select>
          <p className="mt-1 text-2xs text-text-muted">
            At dead centre, ₹5,000 landed in the 50 – 55% band suggests ₹10,560
            — a realised margin of {formatBps(5265)}.
          </p>
        </div>

        <div>
          <Label htmlFor="round">When the price falls between two grid points</Label>
          <Select
            id="round"
            value={roundMode}
            onChange={(e) => setRoundMode(e.target.value as "nearest" | "up")}
          >
            <option value="nearest">Take the nearest</option>
            <option value="up">Always round up</option>
          </Select>
          <p className="mt-1 text-2xs text-text-muted">
            Either way, a snap that leaves the band gets pulled back inside it.
          </p>
        </div>

        <div>
          <Label htmlFor="band">Band to use when no rule matches</Label>
          <Select id="band" value={bandId} onChange={(e) => setBandId(e.target.value)}>
            <option value="">No fallback — require a choice</option>
            {bands.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </Select>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={gst}
            onChange={(e) => setGst(e.target.checked)}
          />
          <span>
            Measure margin on the tag price, GST included
            <span className="block text-2xs text-text-muted">
              How the shop thinks about it. Turning this off measures against the
              ex-GST realisation instead, which at 3% reads roughly 1.5 points
              lower on the same price.
            </span>
          </span>
        </label>

        <div className="flex items-center gap-3 border-t border-border pt-3">
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
          {msg && <span className="text-sm text-status-done-fg">{msg}</span>}
          <FieldError>{error}</FieldError>
        </div>
      </CardBody>
    </Card>
  );
}
