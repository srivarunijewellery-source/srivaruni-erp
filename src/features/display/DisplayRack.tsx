"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FieldError } from "@/components/ui/Field";
import { PhotoZoom } from "@/components/ui/PhotoZoom";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
import { clearDisplaySlot, renameDisplaySection, moveDisplayPiece } from "./actions";
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

  /**
   * A local copy of the rack, moved BEFORE the server is asked.
   *
   * The first version waited for the round trip and then re-rendered the
   * whole page, so a drag ended with the piece sitting where it started
   * for a beat and then teleporting. Moving the copy first makes the
   * gesture feel like moving a physical thing; the server call catches
   * up behind it, and if it fails the copy snaps back with the reason.
   */
  const [live, setLive] = useState<DisplaySection[]>(sections);
  useEffect(() => setLive(sections), [sections]);

  /**
   * Pointer drag, not HTML5 drag and drop.
   *
   * Native dnd gives you a browser-drawn ghost you cannot style, fires
   * nothing useful on a touch screen, and needs a parallel tap-to-move
   * path for the tablet at the counter. One pointer implementation
   * covers mouse, pen and finger, and lets the thing under the cursor
   * actually be the photograph being carried.
   */
  const [drag, setDrag] = useState<{
    placementId: string;
    fromBlockId: string;
    fromCode: string;
    photo: string | null;
    name: string;
    x: number;
    y: number;
    overBlockId: string | null;
  } | null>(null);
  const dragRef = useRef<typeof drag>(null);
  dragRef.current = drag;
  const isDragging = drag !== null;

  /**
   * Where a press began, before it is known to be a drag.
   *
   * A press is ambiguous: it might be a tap to enlarge the photo, or the
   * start of moving the piece. Committing to a drag on pointer-down made
   * every tap flash a preview and then open the viewer anyway. So the
   * press is only PENDING until the pointer travels a few pixels; under
   * that it stays a tap and the photo opens as it always did.
   */
  const pending = useRef<
    | { placementId: string; blockId: string; code: string; photo: string | null;
        name: string; x: number; y: number }
    | null
  >(null);
  /** Set for the instant after a drag so the trailing click cannot open
   *  the zoom on the piece that was just dropped. */
  const justDragged = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const section = live[active];


  // Watches a pending press and promotes it to a drag once the pointer
  // has actually travelled. Always mounted, because the press it is
  // watching for starts before any drag exists.
  useEffect(() => {
    const maybeStart = (e: PointerEvent) => {
      const q = pending.current;
      if (!q || dragRef.current) return;
      if (Math.hypot(e.clientX - q.x, e.clientY - q.y) < 6) return;
      setDrag({
        placementId: q.placementId,
        fromBlockId: q.blockId,
        fromCode: q.code,
        photo: q.photo,
        name: q.name,
        x: e.clientX,
        y: e.clientY,
        overBlockId: q.blockId,
      });
    };
    const clear = () => {
      pending.current = null;
    };
    window.addEventListener("pointermove", maybeStart);
    window.addEventListener("pointerup", clear);
    window.addEventListener("pointercancel", clear);
    return () => {
      window.removeEventListener("pointermove", maybeStart);
      window.removeEventListener("pointerup", clear);
      window.removeEventListener("pointercancel", clear);
    };
  }, []);

  useEffect(() => {
    if (!drag) return;

    const move = (e: PointerEvent) => {
      // The preview is pointer-events:none, so this finds the niche
      // underneath rather than the picture being carried.
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const over = el?.closest("[data-block-id]") as HTMLElement | null;
      setDrag((d) =>
        d
          ? {
              ...d,
              x: e.clientX,
              y: e.clientY,
              overBlockId: over?.dataset.blockId ?? null,
            }
          : d,
      );
    };

    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      pending.current = null;
      // The click that follows this pointerup would otherwise land on
      // the photo and open the viewer on whatever was just dropped.
      justDragged.current = true;
      setTimeout(() => {
        justDragged.current = false;
      }, 0);
      if (!d?.overBlockId || d.overBlockId === d.fromBlockId) return;
      commitMove(d.placementId, d.fromBlockId, d.overBlockId);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    // Keyed on whether a drag exists, not the drag itself: re-binding
    // window listeners on every pointer move would be pointless work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  /**
   * Move locally, then tell the server.
   *
   * Mirrors what move_display_piece does so the optimistic picture is
   * the real one: room on the target means the piece joins it, a full
   * target means the two trade places. If the two ever disagree the
   * refresh below corrects it, but they should not.
   */
  function commitMove(placementId: string, fromBlockId: string, toBlockId: string) {
    setLive((prev) =>
      prev.map((sec) => {
        const from = sec.blocks.find((b) => b.blockId === fromBlockId);
        const to = sec.blocks.find((b) => b.blockId === toBlockId);
        if (!from || !to) return sec;

        const piece = from.pieces.find((p) => p.placementId === placementId);
        if (!piece) return sec;

        const full = to.pieces.length >= to.capacity;
        const displaced = full ? to.pieces[to.pieces.length - 1]! : null;

        return {
          ...sec,
          blocks: sec.blocks.map((b) => {
            if (b.blockId === fromBlockId) {
              return {
                ...b,
                pieces: [
                  ...b.pieces.filter((p) => p.placementId !== placementId),
                  ...(displaced ? [displaced] : []),
                ],
              };
            }
            if (b.blockId === toBlockId) {
              return {
                ...b,
                pieces: [
                  ...b.pieces.filter(
                    (p) => p.placementId !== displaced?.placementId,
                  ),
                  piece,
                ],
              };
            }
            return b;
          }),
        };
      }),
    );

    start(async () => {
      setError(null);
      const r = await moveDisplayPiece(placementId, toBlockId);
      if (!r.ok) {
        setError(r.error);
        setLive(sections);
        return;
      }
      router.refresh();
    });
  }

  /** Tap-to-move, kept for precision and for anyone using a keyboard or
   *  screen reader: a drag is not a gesture everyone can make. */
  const [held, setHeld] = useState<{
    placementId: string;
    from: string;
    blockId: string;
  } | null>(null);

  // EVERY hook is above this line, unconditionally.
  //
  // An early return placed among them changes how many hooks run between
  // one render and the next, which React cannot recover from. My first
  // attempt to fix this moved the guard above two useEffects and still
  // left it above a useState -- the lint rule caught what testing would
  // not have, because the crash only happens on a branch with no
  // sections and Boduppal has five.
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

  function moveTo(blockId: string) {
    if (!held) return;
    const carrying = held;
    setHeld(null);
    if (carrying.blockId === blockId) return;
    commitMove(carrying.placementId, carrying.blockId, blockId);
  }

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
        data-block-id={block.blockId}
        onClick={() => {
          if (held) moveTo(block.blockId);
        }}
        className={`rounded-control border p-1 transition-all duration-150 ${
          // Only the niche actually under the pointer lights up. Lighting
          // every one of thirty-four at once said "something is being
          // dragged", which the pointer already said, and drowned the one
          // piece of information that mattered.
          drag?.overBlockId === block.blockId && drag.fromBlockId !== block.blockId
            ? "scale-[1.04] border-brand bg-status-approved-bg"
            : held && held.blockId !== block.blockId
              ? "border-brand/50"
              : filled
                ? "border-border-strong bg-surface"
                : "border-dashed border-border-strong"
        }`}
      >
        <div className="flex h-[86px] items-center justify-center gap-0.5 overflow-hidden rounded-control bg-surface-sunken">
          {filled ? (
            block.pieces.map((p) => (
              <span
                key={p.placementId}
                onPointerDown={(e) => {
                  if (!canEdit || e.button === 2) return;
                  pending.current = {
                    placementId: p.placementId,
                    blockId: block.blockId,
                    code: block.code,
                    photo: itemPhotoUrl(p.photoPath),
                    name: p.name,
                    x: e.clientX,
                    y: e.clientY,
                  };
                }}
                onClickCapture={(e) => {
                  if (justDragged.current) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
                // Without this a finger drag scrolls the page instead of
                // lifting the piece.
                style={{ touchAction: canEdit ? "none" : undefined }}
                className={
                  drag?.placementId === p.placementId
                    ? "opacity-25"
                    : canEdit
                      ? "cursor-grab active:cursor-grabbing"
                      : undefined
                }
              >
                <PhotoZoom
                  src={itemPhotoUrl(p.photoPath)}
                  alt={p.name}
                  size={block.pieces.length > 1 ? 44 : 88}
                  caption={`${p.barcode} · ${p.name}${
                    p.sellingPricePaise ? ` · ${formatPaise(p.sellingPricePaise)}` : ""
                  }`}
                />
              </span>
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
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const last = block.pieces[block.pieces.length - 1]!;
                  setHeld(
                    held?.placementId === last.placementId
                      ? null
                      : {
                          placementId: last.placementId,
                          from: block.code,
                          blockId: block.blockId,
                        },
                  );
                }}
                className={`text-2xs ${
                  held?.from === block.code ? "text-brand" : "text-text-muted"
                }`}
                aria-label={`Move the piece on ${block.code}`}
                title="Pick up, then tap where it should go"
              >
                ⇄
              </button>
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
        {live.map((s, i) => (
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

      {drag && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-control border-2 border-brand bg-surface p-0.5 shadow-raised"
          style={{ left: drag.x, top: drag.y }}
          aria-hidden="true"
        >
          <PhotoThumb src={drag.photo} alt="" size={64} />
        </div>
      )}

      {held && (
        <p className="print-hide rounded-control border border-brand bg-status-approved-bg px-3 py-2 text-sm">
          Carrying the piece from {held.from}. Tap the neck it should go to —
          onto an empty one it moves, onto a full one the two swap.{" "}
          <button
            type="button"
            onClick={() => setHeld(null)}
            className="text-brand underline"
          >
            put it back
          </button>
        </p>
      )}

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
          sectionId={section.sectionId}
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
