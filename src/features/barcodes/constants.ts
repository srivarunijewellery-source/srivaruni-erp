/**
 * Shared between the client queue UI and the server-side PDF generator.
 *
 * This file exists ONLY to be safely importable from a "use client"
 * component. pdf.ts pulls in pdf-lib and bwip-js -- fine on the server,
 * but importing anything from that module (even just a type or a
 * constant) drags the whole module graph into the client bundle, since
 * bundlers can't tree-shake past a value-level import at the top of the
 * same file. That turned a 3.65kB client page into 423kB. Constants used
 * by both sides live here instead; pdf.ts imports from here too, never
 * the other way around.
 */

/** The label stock itself. Fixed by what you buy. */
export const LABEL_W_MM = 100;
export const LABEL_H_MM = 15;

/**
 * How much of the 100mm actually carries print, and where it folds.
 *
 * Both are measured values, not derived ones. The first print run showed
 * the fold does NOT sit at the midpoint of the printable area -- the
 * stock is pre-scored at a fixed position, so the two panels are not
 * necessarily equal halves. Keeping foldAt independent of printArea is
 * what lets the layout match the physical score line instead of fighting
 * it. Use the calibration sheet to measure both.
 */
export const DEFAULT_PRINT_AREA_MM = 72;
export const MIN_PRINT_AREA_MM = 30;
export const MAX_PRINT_AREA_MM = 100;

export const DEFAULT_FOLD_AT_MM = 36;
export const MIN_FOLD_AT_MM = 10;

/** Blank space between one label and the next along the feed direction. */
export const DEFAULT_GAP_MM = 2;
export const MIN_GAP_MM = 0;
export const MAX_GAP_MM = 5;

export interface LabelGeometry {
  printAreaMm: number;
  foldAtMm: number;
  /** Print the item name in capitals whatever case it was typed in. The
   *  stored name is untouched, so search still matches what was typed. */
  uppercaseItems: boolean;
  /** Bold reads better at a counter; regular fits more characters. */
  boldNames: boolean;
  gapMm: number;
}

export const DEFAULT_GEOMETRY: LabelGeometry = {
  printAreaMm: DEFAULT_PRINT_AREA_MM,
  foldAtMm: DEFAULT_FOLD_AT_MM,
  uppercaseItems: false,
  boldNames: true,
  gapMm: DEFAULT_GAP_MM,
};

export function clampGeometry(g: Partial<LabelGeometry>): LabelGeometry {
  const printAreaMm = Math.min(
    MAX_PRINT_AREA_MM,
    Math.max(MIN_PRINT_AREA_MM, g.printAreaMm ?? DEFAULT_PRINT_AREA_MM),
  );
  // The fold must leave a usable panel on both sides of itself.
  const foldAtMm = Math.min(
    printAreaMm - MIN_FOLD_AT_MM,
    Math.max(MIN_FOLD_AT_MM, g.foldAtMm ?? DEFAULT_FOLD_AT_MM),
  );
  const gapMm = Math.min(MAX_GAP_MM, Math.max(MIN_GAP_MM, g.gapMm ?? DEFAULT_GAP_MM));
  return {
    printAreaMm, foldAtMm, gapMm,
    uppercaseItems: g.uppercaseItems ?? false,
    boldNames: g.boldNames ?? true,
  };
}
