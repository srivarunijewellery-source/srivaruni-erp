import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/config/nav";
import { can } from "@/config/roles";
import type { Role, TransferSummary } from "@/types/domain";

/**
 * The next legal step, named, as a link into the document.
 *
 * Actions used to fire straight from this row. They no longer can: picking
 * and receiving are scanning screens, and approving means looking at what
 * is actually in the box. A one-click "Approve" in a list is exactly how
 * someone signs off on a shortfall without seeing it.
 */
export function TransferActions({
  transfer,
  role,
}: {
  transfer: TransferSummary;
  role: Role;
}) {
  const step = (() => {
    switch (transfer.status) {
      case "requested":
        return can(role, "transfer.pick") ? { label: "Pick", primary: true } : null;
      case "picking":
        return can(role, "transfer.pick") ? { label: "Continue picking", primary: true } : null;
      case "picked":
        return can(role, "transfer.approve") ? { label: "Review & approve", primary: true } : null;
      case "approved":
        return can(role, "transfer.dispatch") ? { label: "Ship", primary: true } : null;
      case "dispatched":
        return can(role, "transfer.receive") ? { label: "Receive", primary: true } : null;
      default:
        return null;
    }
  })();

  // A request can still be changed, and that has to be visible from the
  // list. The step button already opened this document, but it is
  // labelled "Pick" -- which reads as "start picking", not "open it and
  // change what was asked for". Someone wanting to add a piece had no
  // reason to press it.
  const editable = transfer.status === "requested" && can(role, "transfer.request");

  return (
    <div className="flex items-center justify-end gap-2">
      {editable && (
        <Link href={ROUTES.transferDetail(transfer.id)}>
          <Button size="sm" variant="secondary">
            Edit
          </Button>
        </Link>
      )}
      <Link href={ROUTES.transferDetail(transfer.id)}>
        <Button size="sm" variant={step?.primary ? "primary" : "secondary"}>
          {step?.label ?? "Open"}
        </Button>
      </Link>
    </div>
  );
}
