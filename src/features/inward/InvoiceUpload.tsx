"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { attachInvoice, getInvoiceUrl } from "./actions";
import { compressImage } from "@/lib/image";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FieldError } from "@/components/ui/Field";
import { formatDate } from "@/lib/format";
import type { InwardAttachment } from "./queries";

/**
 * Vendor bill upload.
 *
 * Load-bearing, not optional: staff never enter purchase rates, so this
 * scan is the owner's only source for them. submit_inward refuses a
 * document without one.
 *
 * The file goes straight from the browser to the PRIVATE inward-invoices
 * bucket. Staff can upload but cannot read back; only the owner can open
 * one, through a short-lived signed URL.
 */
export function InvoiceUpload({
  inwardId,
  attachments,
  canUpload,
  canView,
}: {
  inwardId: string;
  attachments: InwardAttachment[];
  canUpload: boolean;
  canView: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const isPdf = file.type === "application/pdf";
      const body = isPdf ? file : await compressImage(file);
      const ext = isPdf ? "pdf" : "jpg";
      const path = `${inwardId}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("inward-invoices")
        .upload(path, body, {
          contentType: isPdf ? "application/pdf" : "image/jpeg",
          upsert: false,
        });

      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }

      start(async () => {
        const fd = new FormData();
        fd.set("inwardId", inwardId);
        fd.set("storagePath", path);
        const result = await attachInvoice(fd);
        if (!result.ok) setError(result.error);
      });
    } catch {
      setError("Could not read that file. Try again.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const open = async (path: string) => {
    const result = await getInvoiceUrl(path);
    if (result.ok) window.open(result.data, "_blank", "noopener");
    else setError(result.error);
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="font-medium">Vendor bill</h2>
      </CardHeader>
      <CardBody className="space-y-3">
        {attachments.length === 0 ? (
          <p className="text-sm text-text-muted">
            No bill attached yet. One is required before this can go for pricing.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {attachments.map((a, i) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="font-mono text-2xs text-text-muted">
                  Bill {i + 1} · {formatDate(a.createdAt)}
                </span>
                {canView ? (
                  <button
                    onClick={() => open(a.storagePath)}
                    className="text-sm text-brand hover:underline"
                  >
                    Open
                  </button>
                ) : (
                  <span className="text-2xs text-text-subtle">Attached</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {canUpload && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
            <Button
              variant="secondary"
              fullWidth
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? "Uploading…" : "Photograph the bill"}
            </Button>
          </>
        )}

        {error && <FieldError>{error}</FieldError>}
      </CardBody>
    </Card>
  );
}
