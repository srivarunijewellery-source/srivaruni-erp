"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { itemPhotoUrl } from "@/lib/storage";
import { cn } from "@/lib/cn";
import { scanPick, scanReceive } from "./actions";
import type { TransferLine } from "@/types/domain";

type Mode = "pick" | "receive";

/**
 * Requested versus counted, one row per item.
 *
 * The bar is the point: a picker walking a rail needs to see what is still
 * outstanding without reading numbers. Short lines stay visible rather than
 * dropping off the list, because a shortfall is information the receiving
 * store needs, not an error to hide.
 */
export function LineProgress({
  lines,
  mode,
  showAvailable,
  transferId,
  adjustable,
}: {
  lines: TransferLine[];
  mode: Mode;
  showAvailable?: boolean;
  /** Needed only when adjustable. */
  transferId?: string;
  /**
   * Lets any line be corrected, not just the last one scanned.
   *
   * "Undo that scan" only ever reached the most recent scan, and only
   * while its card was still on screen — reload the page, or notice the
   * mistake three scans later, and there was no way back. On a rail of
   * two hundred pieces that is most mistakes.
   */
  adjustable?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function nudge(barcode: string, delta: number) {
    if (!transferId) return;
    start(async () => {
      const fd = new FormData();
      fd.set("transferId", transferId);
      fd.set("barcode", barcode);
      fd.set("delta", String(delta));
      const r = mode === "pick" ? await scanPick(fd) : await scanReceive(fd);
      if (r.ok) router.refresh();
    });
  }

  return (
    <ul className="divide-y divide-border">
      {lines.map((l) => {
        const target = mode === "pick" ? l.qtyRequested : l.qtySent;
        const counted = mode === "pick" ? l.qtyPicked : (l.qtyReceived ?? 0);
        const complete = target > 0 && counted >= target;
        const short = Math.max(target - counted, 0);
        const pct = target > 0 ? Math.min(100, (counted / target) * 100) : 0;

        // Zero target means different things per screen: while picking it
        // means this was added and never part of the original ask (still
        // shown, since it's genuinely going in the box); on the receive
        // screen it means the line never actually shipped at all.
        const zeroTarget = target === 0;
        const extra = mode === "pick" && zeroTarget;

        // Only meaningful while picking: the shelf may not hold what was asked for.
        const overAvailable = mode === "pick" && l.qtyRequested > l.qtyAvailable;

        return (
          <li key={l.id} className="flex items-center gap-3 py-2">
            <PhotoThumb src={itemPhotoUrl(l.photoPath)} alt={l.name} size={44} />

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                {l.name}
                {extra && (
                  <span className="shrink-0 rounded-full bg-status-pending-bg px-1.5 py-0.5 text-2xs font-medium text-status-pending-fg">
                    Extra
                  </span>
                )}
              </p>
              <p className="font-mono text-2xs text-text-muted">
                {l.barcode}
                {showAvailable && (
                  <>
                    {" · "}
                    <span className={cn(overAvailable && "text-status-danger-fg")}>
                      {l.qtyAvailable} on shelf
                    </span>
                  </>
                )}
              </p>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width]",
                    extra ? "bg-status-pending-fg" : complete ? "bg-status-done-fg" : "bg-brand",
                  )}
                  style={{ width: extra ? "100%" : `${pct}%` }}
                />
              </div>
            </div>

            <div className="shrink-0 text-right">
              <p className="tnum font-mono text-sm font-semibold">
                {extra ? (
                  // What is in the box, not what was approved to send.
                  // qty_sent stays 0 until approval, so an extra line
                  // read "0" on the very screen where it had just been
                  // scanned — the picker sees the piece go in and the
                  // row says nothing happened.
                  counted
                ) : mode === "receive" && zeroTarget ? (
                  <span className="text-text-muted">not shipped</span>
                ) : (
                  <>
                    {counted}
                    <span className="text-text-muted"> / {target}</span>
                  </>
                )}
              </p>
              {!extra && !zeroTarget && short > 0 && (
                <p className="text-2xs text-status-danger-fg">{short} short</p>
              )}

              {adjustable && (
                <div className="mt-1 flex items-center justify-end gap-1">
                  <button
                    type="button"
                    disabled={pending || counted === 0}
                    onClick={() => nudge(l.barcode, -1)}
                    aria-label={`One fewer ${l.name}`}
                    className="rounded-control border border-border px-2 py-0.5 text-2xs disabled:opacity-40"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    disabled={pending || (target > 0 && counted >= target)}
                    onClick={() => nudge(l.barcode, 1)}
                    aria-label={`One more ${l.name}`}
                    className="rounded-control border border-border px-2 py-0.5 text-2xs disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
