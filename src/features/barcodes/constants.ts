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

export type PrintAreaMm = 65 | 70;

export const DEFAULT_GAP_MM = 2;
export const MIN_GAP_MM = 0;
export const MAX_GAP_MM = 5;
