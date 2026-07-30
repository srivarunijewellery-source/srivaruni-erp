"use client";

import { Button } from "@/components/ui/Button";

export function PrintButton({ transferId }: { transferId: string }) {
  return (
    <div className="flex gap-2">
      <a href={`/api/transfers/${transferId}/slip`} download>
        <Button variant="secondary">Download CSV</Button>
      </a>
      <Button variant="primary" onClick={() => window.print()}>
        Print
      </Button>
    </div>
  );
}
