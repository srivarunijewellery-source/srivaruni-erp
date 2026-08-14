"use client";

import { ItemLink } from "@/components/ui/ItemLink";
import { Barcode } from "@/components/ui/Barcode";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { LineQtyEditor } from "./LineQtyEditor";
import { LineActions } from "./LineActions";
import { AddItemDialog } from "./AddItemDialog";
import { AttachExistingDialog } from "./AttachExistingDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { itemPhotoUrl } from "@/lib/storage";
import type { InwardLine, ItemFormOptions } from "@/types/domain";

/**
 * Received lines, read-only by default.
 *
 * A record document should read like a record. Editing is a mode you
 * enter deliberately, so nobody changes a quantity on a document they
 * only opened to look at. Column widths are fixed so the numbers line
 * up down the page rather than shifting with the longest name.
 */
export function LinesSection({
  inwardId,
  lines,
  editable,
  options,
}: {
  inwardId: string;
  lines: InwardLine[];
  editable: boolean;
  options: ItemFormOptions | null;
}) {
  const active = editable;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-muted">
          {active
            ? "Add each design as you unpack it. Quantities are editable below."
            : `${lines.length} ${lines.length === 1 ? "line" : "lines"} received.`}
        </p>

        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            {active && options && (
              <>
                <AttachExistingDialog inwardId={inwardId} />
                <AddItemDialog inwardId={inwardId} options={options} />
              </>
            )}
          </div>
        )}
      </div>

      {lines.length === 0 ? (
        <EmptyState
          title="Nothing added yet"
          hint={
            editable
              ? "Press Edit lines, then add each design as you unpack the carton."
              : "This document has no lines."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[56px]" />
              <col className="w-[104px]" />
              <col />
              <col className="w-[140px]" />
              <col className="w-[92px]" />
              <col className="w-[72px]" />
              {active && <col className="w-[64px]" />}
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-surface-sunken">
                <Th />
                <Th>Tag</Th>
                <Th>Item</Th>
                <Th>Category</Th>
                <Th right>Received</Th>
                <Th right>Short</Th>
                {active && <Th />}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-2 py-1.5">
                    <PhotoThumb src={itemPhotoUrl(l.photoPath)} alt={l.name} size={44} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Barcode code={l.barcode} />
                  </td>
                  <td className="truncate px-2 py-1.5 font-medium" title={l.name}>
                    <ItemLink itemId={l.itemId} name={l.name} />
                  </td>
                  <td className="truncate px-2 py-1.5 text-text-muted">{l.category}</td>
                  <td className="px-2 py-1.5 text-right">
                    <LineQtyEditor
                      lineId={l.id}
                      inwardId={inwardId}
                      qty={l.qty}
                      editable={active}
                    />
                  </td>
                  <td className="tnum px-2 py-1.5 text-right">
                    {l.qtyShort > 0 ? (
                      <span className="text-status-danger-fg">{l.qtyShort}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  {active && (
                    <td className="px-2 py-1.5 text-right">
                      <LineActions lineId={l.id} inwardId={inwardId} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text-muted ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
