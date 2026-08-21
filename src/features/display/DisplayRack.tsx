"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FieldError } from "@/components/ui/Field";
import { PhotoZoom } from "@/components/ui/PhotoZoom";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
import { clearDisplaySlot } from "./actions";
import { DisplayPicker } from "./DisplayPicker";
import type { DisplaySection, DisplayBlock } from "./queries";

/**
 * The rack, one section at a time.
 *
 * Laid out as the wall is: ten necks unbroken across the top, then three
 * rows of four either side of the half mannequin. Four rows fit a laptop
 * without scrolling, which is the point -- the job this screen does is
 * "which necks are bare and which are crowded", and that is a question
 * you answer by looking at the whole section at once.
 *
 * The niches are therefore small, and identification happens on tap
 * rather than in the grid: a 116px box cannot tell a long chain from a
 * short one at a glance, and pretending otherwise would make the grid
 * useless at both jobs.
 */
export function DisplayRack({
  sections,
  locationId,
  canEdit,
}: {
  sections: DisplaySection[];
  locationId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [picking, setPicking] = useState<DisplayBlock | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const section = sections[active];
  if (!section) {
    return <p className="text-sm text-text-muted">No display racks set up yet.</p>;
  }

  const top = section.blocks.filter((b) => b.rowNo === 1).sort((a, b) => a.colNo - b.colNo);
  const lower = [2, 3, 4].map((r) =>
    section.blocks.filter((b) => b.rowNo === r && b.kind === "neck").sort((a, b) => a.colNo - b.colNo),
  );
  const mannequin = section.blocks.find((b) => b.kind === "mannequin");

  function remove(placementId: string) {
    start(async () => {
      setError(null);
      const r = await clearDisplaySlot(placementId);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  const Niche = ({ block }: { block: DisplayBlock }) => {
    const filled = block.pieces.length > 0;
    return (
      <div
        className={`rounded-control border p-1 ${
          filled ? "border-border-strong bg-surface" : "border-dashed border-border-strong"
        }`}
      >
        <div className="flex h-[92px] items-center justify-center gap-0.5 overflow-hidden rounded-control bg-surface-sunken">
          {filled ? (
            block.pieces.map((p) => (
              <PhotoZoom
                key={p.placementId}
                src={itemPhotoUrl(p.photoPath)}
                alt={p.name}
                size={block.pieces.length > 1 ? 44 : 88}
                caption={`${p.barcode} · ${p.name}${
                  p.sellingPricePaise ? ` · ${formatPaise(p.sellingPricePaise)}` : ""
                }`}
              />
            ))
          ) : canEdit ? (
            <button
              type="button"
              onClick={() => setPicking(block)}
              aria-label={`Add a piece to ${block.code}`}
              className="flex h-full w-full items-center justify-center text-lg text-text-subtle hover:text-brand"
            >
              +
            </button>
          ) : (
            <span className="text-2xs text-text-subtle">empty</span>
          )}
        </div>

        <div className="flex items-center justify-between gap-1 px-0.5 pt-0.5">
          <span className="font-mono text-2xs text-text-subtle">{block.code}</span>
          {canEdit && filled && (
            <span className="flex gap-1">
              {block.pieces.length < block.capacity && (
                <button
                  type="button"
                  onClick={() => setPicking(block)}
                  className="text-2xs text-brand"
                  aria-label={`Add another to ${block.code}`}
                >
                  +
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(block.pieces[block.pieces.length - 1]!.placementId)}
                className="text-2xs text-text-muted hover:text-status-danger-fg"
                aria-label={`Take the last piece off ${block.code}`}
              >
                ×
              </button>
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {sections.map((s, i) => (
          <button
            key={s.sectionId}
            type="button"
            onClick={() => setActive(i)}
            className={`rounded-control px-3 py-1.5 text-sm ${
              i === active
                ? "bg-brand text-brand-fg"
                : "border border-border text-text-muted"
            }`}
          >
            {s.code}
            <span className="ml-1.5 text-2xs opacity-80">
              {s.filled}/{s.total}
            </span>
          </button>
        ))}
        <span className="ml-auto text-2xs text-text-muted">
          Tap a photo to enlarge · tap + to hang a piece
        </span>
      </div>

      {error && <FieldError>{error}</FieldError>}

      <div className="rounded-card border border-border-strong bg-surface-sunken p-2">
        <div className="mb-2 grid grid-cols-10 gap-1 border-b border-border pb-2">
          {top.map((b) => (
            <Niche key={b.blockId} block={b} />
          ))}
        </div>

        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr)) 1.7fr repeat(4,minmax(0,1fr))" }}
        >
          {lower.map((row, ri) => (
            <RowCells
              key={ri}
              row={row}
              rowIndex={ri}
              mannequin={mannequin}
              Niche={Niche}
              canEdit={canEdit}
              onPick={setPicking}
            />
          ))}
        </div>
      </div>

      {picking && (
        <DisplayPicker
          block={picking}
          locationId={locationId}
          onClose={() => setPicking(null)}
          onPlaced={() => {
            setPicking(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/**
 * One lower row: four necks, the mannequin, four necks.
 *
 * The mannequin is emitted only on the first row and told to span three,
 * which is what makes the centre column a single tall box rather than
 * three stacked ones.
 */
function RowCells({
  row,
  rowIndex,
  mannequin,
  Niche,
  canEdit,
  onPick,
}: {
  row: DisplayBlock[];
  rowIndex: number;
  mannequin: DisplayBlock | undefined;
  Niche: (p: { block: DisplayBlock }) => React.JSX.Element;
  canEdit: boolean;
  onPick: (b: DisplayBlock) => void;
}) {
  const left = row.filter((b) => b.colNo <= 4);
  const right = row.filter((b) => b.colNo > 5);

  return (
    <>
      {left.map((b) => (
        <Niche key={b.blockId} block={b} />
      ))}

      {rowIndex === 0 && mannequin && (
        <div
          className="row-span-3 flex flex-col rounded-control border border-border-strong bg-surface p-1.5"
          style={{ gridRow: "span 3" }}
        >
          <div className="flex flex-1 flex-wrap items-center justify-center gap-1 overflow-hidden rounded-control bg-surface-sunken p-1">
            {mannequin.pieces.length > 0 ? (
              mannequin.pieces.map((p) => (
                <PhotoZoom
                  key={p.placementId}
                  src={itemPhotoUrl(p.photoPath)}
                  alt={p.name}
                  size={52}
                  caption={`${p.barcode} · ${p.name}`}
                />
              ))
            ) : (
              <span className="text-2xs text-text-subtle">empty</span>
            )}
          </div>
          <div className="flex items-center justify-between px-0.5 pt-1">
            <span className="font-mono text-2xs text-text-subtle">
              {mannequin.code} · {mannequin.pieces.length}/{mannequin.capacity}
            </span>
            {canEdit && mannequin.pieces.length < mannequin.capacity && (
              <button
                type="button"
                onClick={() => onPick(mannequin)}
                className="text-2xs text-brand"
                aria-label="Add a piece to the mannequin"
              >
                +
              </button>
            )}
          </div>
        </div>
      )}

      {right.map((b) => (
        <Niche key={b.blockId} block={b} />
      ))}
    </>
  );
}
