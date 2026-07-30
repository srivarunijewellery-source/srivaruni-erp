import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { itemPhotoUrl } from "@/lib/storage";
import { cn } from "@/lib/cn";
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
}: {
  lines: TransferLine[];
  mode: Mode;
  showAvailable?: boolean;
}) {
  return (
    <ul className="divide-y divide-border">
      {lines.map((l) => {
        const target = mode === "pick" ? l.qtyRequested : l.qtySent;
        const counted = mode === "pick" ? l.qtyPicked : (l.qtyReceived ?? 0);
        const complete = counted >= target;
        const short = target - counted;
        const pct = target > 0 ? Math.min(100, (counted / target) * 100) : 0;

        // Only meaningful while picking: the shelf may not hold what was asked for.
        const overAvailable = mode === "pick" && l.qtyRequested > l.qtyAvailable;

        return (
          <li key={l.id} className="flex items-center gap-3 py-2">
            <PhotoThumb src={itemPhotoUrl(l.photoPath)} alt={l.name} size={44} />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{l.name}</p>
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
                    complete ? "bg-status-done-fg" : "bg-brand",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <div className="shrink-0 text-right">
              <p className="tnum font-mono text-sm font-semibold">
                {counted}
                <span className="text-text-muted"> / {target}</span>
              </p>
              {short > 0 && (
                <p className="text-2xs text-status-danger-fg">{short} short</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
