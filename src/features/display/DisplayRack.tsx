"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FieldError } from "@/components/ui/Field";
import { PhotoZoom } from "@/components/ui/PhotoZoom";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
import { clearDisplaySlot, renameDisplaySection } from "./actions";
import { Input } from "@/components/ui/Field";
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
  canConfigure,
  facets,
}: {
  sections: DisplaySection[];
  locationId: string;
  /** Hang and unhang: the counter's daily job. */
  canEdit: boolean;
  /** Rename a section: a decision about the shop, so owner only. */
  canConfigure: boolean;
  facets: {
    categories: string[];
    styles: string[];
    platings: string[];
    vendors: string[];
  };
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
  // Nine on top, not ten. The column count follows the data rather than
  // a hard-coded ten, so a rack that differs again is a seed change.
  const topCols = Math.max(top.length, 1);
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
        <div className="flex h-[86px] items-center justify-center gap-0.5 overflow-hidden rounded-control bg-surface-sunken">
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

        {/* The names sit here rather than only in the zoom, because the
            spare height at the bottom of the screen was doing nothing
            and a wall of unlabelled photographs is hard to talk about
            across a shop floor. */}
        <div className="h-[26px] overflow-hidden px-0.5 pt-0.5 leading-tight">
          {filled ? (
            block.pieces.map((p) => (
              <p key={p.placementId} className="truncate text-[10px]">
                <span className="font-mono text-text-subtle">{p.barcode}</span>{" "}
                <span className="text-text-muted">{p.name}</span>
              </p>
            ))
          ) : (
            <p className="text-[10px] text-text-subtle">empty</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-1 border-t border-border px-0.5 pt-0.5">
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
      {/* Landscape, and the table only.
          Printing the page as it stands put the whole screen on paper --
          nav, tabs, a grid of photographs -- across three portrait pages,
          which is not something anyone carries round a rack. What is
          wanted on paper is the positions: code, tag, name. So the grid
          and the chrome are hidden at print time and the table is left
          to fill the sheet sideways, where the four columns fit. */}
      <style>{`
        @media print {
          @page { size: landscape; margin: 12mm; }
          body * { visibility: hidden; }
          .print-positions, .print-positions * { visibility: visible; }
          .print-positions {
            position: absolute; left: 0; top: 0; width: 100%;
          }
          .print-hide { display: none !important; }
        }
      `}</style>

      <div className="print-hide flex flex-wrap items-center gap-2">
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

      <div className="print-hide">
        <SectionTitle
          section={section}
          canConfigure={canConfigure}
          onRenamed={() => router.refresh()}
        />
      </div>

      {error && <FieldError>{error}</FieldError>}

      <div className="print-hide rounded-card border border-border-strong bg-surface-sunken p-2">
        <div
          className="mb-2 grid gap-1 border-b border-border pb-2"
          style={{ gridTemplateColumns: `repeat(${topCols},minmax(0,1fr))` }}
        >
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

      <PositionTable section={section} />

      {picking && (
        <DisplayPicker
          block={picking}
          locationId={locationId}
          facets={facets}
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


/**
 * What the section is called, and renaming it.
 *
 * Owner only. Hanging a piece is the counter's daily job; what a run of
 * rack is CALLED is a decision everyone else then reads off, and a name
 * that changes under people is worse than a dull one.
 */
function SectionTitle({
  section,
  canConfigure,
  onRenamed,
}: {
  section: DisplaySection;
  canConfigure: boolean;
  onRenamed: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(section.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium">{section.name}</h2>
        <span className="text-2xs text-text-subtle">
          {section.filled} of {section.total} filled
        </span>
        {canConfigure && (
          <button
            type="button"
            onClick={() => {
              setName(section.name);
              setEditing(true);
            }}
            className="text-2xs text-brand hover:underline"
          >
            rename
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-56"
        placeholder="Bridal wall, left of the counter"
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <button
        type="button"
        disabled={busy || name.trim().length === 0}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await renameDisplaySection(section.sectionId, name);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            setEditing(false);
            onRenamed();
          })
        }
        className="rounded-control bg-brand px-2.5 py-1 text-2xs text-brand-fg disabled:opacity-50"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-2xs text-text-muted hover:underline"
      >
        Cancel
      </button>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

/**
 * The same section as a list, for printing.
 *
 * The grid answers "which necks are bare" at a glance; it does not
 * survive being carried around a shop floor. This is the version someone
 * prints, walks the rack with, and arranges from -- then comes back to
 * the screen to check the result.
 *
 * Ordered the way the wall reads: top row left to right, then each lower
 * row left block, mannequin, right block.
 */
function PositionTable({ section }: { section: DisplaySection }) {
  const ordered = [...section.blocks].sort(
    (a, b) => a.rowNo - b.rowNo || a.colNo - b.colNo,
  );

  return (
    <div className="print-positions rounded-card border border-border bg-surface">
      {/* Only shown on paper: on screen the section name is already
          above the grid. */}
      <h3 className="hidden px-3 pt-2 text-base font-medium print:block">
        {section.name} · positions
      </h3>
      <div className="print-hide flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h3 className="text-sm font-medium">{section.name} · positions</h3>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-control border border-border-strong px-2.5 py-1 text-2xs hover:bg-surface-sunken"
        >
          Print this section
        </button>
      </div>
      <table className="w-full text-2xs print:text-[11px]">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-3 py-1.5 font-medium">Position</th>
            <th className="px-2 py-1.5 font-medium">Tag</th>
            <th className="px-2 py-1.5 font-medium">Item</th>
            <th className="px-3 py-1.5 text-right font-medium">Price</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((b) =>
            b.pieces.length === 0 ? (
              <tr key={b.blockId} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5 font-mono">{b.code}</td>
                <td className="px-2 py-1.5 text-text-subtle" colSpan={3}>
                  empty
                </td>
              </tr>
            ) : (
              b.pieces.map((p, i) => (
                <tr
                  key={p.placementId}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-1.5 font-mono">
                    {i === 0 ? b.code : ""}
                    {b.pieces.length > 1 && (
                      <span className="ml-1 text-text-subtle">·{p.slot}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{p.barcode}</td>
                  <td className="max-w-56 truncate px-2 py-1.5">{p.name}</td>
                  <td className="tnum px-3 py-1.5 text-right">
                    {p.sellingPricePaise === null
                      ? "—"
                      : formatPaise(p.sellingPricePaise)}
                  </td>
                </tr>
              ))
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}
