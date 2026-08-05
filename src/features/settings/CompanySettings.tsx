"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { saveBank, saveBranch, saveBusiness } from "./actions";
import type { BankRow, BranchRow, BusinessSettings } from "./queries";

type Tab = "company" | "branches" | "banks";

export function CompanySettings({
  business,
  branches,
  banks,
  tills,
}: {
  business: BusinessSettings;
  branches: BranchRow[];
  banks: BankRow[];
  tills: Array<{ id: string; name: string }>;
}) {
  const [tab, setTab] = useState<Tab>("company");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editBranch, setEditBranch] = useState<BranchRow | null>(null);
  const [addBranch, setAddBranch] = useState(false);
  const [editBank, setEditBank] = useState<BankRow | null>(null);
  const [addBank, setAddBank] = useState(false);

  function run(fn: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, fd: FormData, done?: () => void) {
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await fn(fd);
      if (r.ok) {
        setNotice("Saved.");
        done?.();
      } else setError(r.error ?? "That did not work.");
    });
  }

  const TABS: Array<{ key: Tab; label: string; count?: number }> = [
    { key: "company", label: "Company" },
    { key: "branches", label: "Branches", count: branches.length },
    { key: "banks", label: "Bank accounts", count: banks.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-control border border-border bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-control px-4 py-2 text-sm transition-colors ${
              tab === t.key
                ? "bg-brand text-brand-fg"
                : "text-text-muted hover:bg-surface-sunken"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1.5 text-2xs opacity-75">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {notice && <p className="text-sm text-status-done-fg">{notice}</p>}
      <FieldError>{error}</FieldError>

      {tab === "company" && (
        <Card>
          <CardHeader className="font-medium">Company details</CardHeader>
          <CardBody>
            <form
              action={(fd) => run(saveBusiness, fd)}
              className="space-y-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="legalName">Legal name</Label>
                  <Input id="legalName" name="legalName" required defaultValue={business.legalName} />
                </div>
                <div>
                  <Label htmlFor="gstin">GSTIN</Label>
                  <Input id="gstin" name="gstin" defaultValue={business.gstin ?? ""} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="pan">PAN</Label>
                  <Input id="pan" name="pan" defaultValue={business.pan ?? ""} />
                </div>
                <div>
                  <Label htmlFor="cin">CIN</Label>
                  <Input id="cin" name="cin" defaultValue={business.cin ?? ""} />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" defaultValue={business.phone ?? ""} />
                </div>
              </div>

              <div>
                <Label htmlFor="address">Registered address</Label>
                <Textarea id="address" name="address" rows={2} defaultValue={business.address ?? ""} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" defaultValue={business.email ?? ""} />
                </div>
                <div>
                  <Label htmlFor="website">Website</Label>
                  <Input id="website" name="website" defaultValue={business.website ?? ""} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="homeState">Home state</Label>
                  <Input id="homeState" name="homeState" defaultValue={business.homeState} />
                </div>
                <div>
                  <Label htmlFor="homeStateCode">State code</Label>
                  <Input
                    id="homeStateCode"
                    name="homeStateCode"
                    defaultValue={business.homeStateCode}
                    className="w-24"
                  />
                </div>
              </div>
              <p className="text-2xs text-text-muted">
                Home state is not cosmetic: every invoice compares the customer&rsquo;s
                state against it to decide CGST + SGST versus IGST. Getting it wrong
                misclassifies the tax on every sale.
              </p>

              <div>
                <Label htmlFor="invoiceTerms">Invoice terms</Label>
                <Textarea
                  id="invoiceTerms"
                  name="invoiceTerms"
                  rows={2}
                  defaultValue={business.invoiceTerms ?? ""}
                  placeholder="Goods once sold will not be taken back or exchanged after 7 days."
                />
              </div>
              <div>
                <Label htmlFor="invoiceFooter">Invoice footer</Label>
                <Input
                  id="invoiceFooter"
                  name="invoiceFooter"
                  defaultValue={business.invoiceFooter ?? ""}
                  placeholder="Thank you, do visit again"
                />
              </div>

              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save company details"}
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      {tab === "branches" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <span className="font-medium">Branches</span>
              <Button
                size="sm"
                variant={addBranch ? "ghost" : "primary"}
                onClick={() => {
                  setAddBranch(!addBranch);
                  setEditBranch(null);
                }}
              >
                {addBranch ? "Cancel" : "Add branch"}
              </Button>
            </CardHeader>

            {(addBranch || editBranch) && (
              <CardBody className="border-b border-border">
                <BranchForm
                  branch={editBranch}
                  pending={pending}
                  onSubmit={(fd) =>
                    run(saveBranch, fd, () => {
                      setAddBranch(false);
                      setEditBranch(null);
                    })
                  }
                />
              </CardBody>
            )}

            <CardBody className="p-0">
              <ul className="divide-y divide-border">
                {branches.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-40 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {b.code} <span className="text-text-muted">{b.name}</span>
                        <Badge tone="neutral">{b.kind}</Badge>
                        {!b.active && <Badge tone="danger">closed</Badge>}
                      </p>
                      <p className="mt-0.5 text-2xs text-text-muted">
                        {[b.address, b.phone, b.gstin ? `GSTIN ${b.gstin}` : null,
                          b.billPrefix ? `bills ${b.billPrefix}/…` : null,
                          b.billsIssued > 0 ? `${b.billsIssued} issued` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditBranch(b);
                        setAddBranch(false);
                      }}
                    >
                      Edit
                    </Button>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "banks" && (
        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <span className="font-medium">Bank accounts</span>
            <Button
              size="sm"
              variant={addBank ? "ghost" : "primary"}
              onClick={() => {
                setAddBank(!addBank);
                setEditBank(null);
              }}
            >
              {addBank ? "Cancel" : "Add account"}
            </Button>
          </CardHeader>

          {(addBank || editBank) && (
            <CardBody className="border-b border-border">
              <BankForm
                bank={editBank}
                tills={tills}
                pending={pending}
                onSubmit={(fd) =>
                  run(saveBank, fd, () => {
                    setAddBank(false);
                    setEditBank(null);
                  })
                }
              />
            </CardBody>
          )}

          <CardBody className="p-0">
            {banks.length === 0 ? (
              <p className="px-4 py-6 text-sm text-text-muted">
                No bank accounts yet. Add one to show payment details on invoices.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {banks.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-40 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {b.label}
                        {b.showOnInvoice && <Badge tone="done">on invoice</Badge>}
                        {!b.active && <Badge tone="danger">inactive</Badge>}
                      </p>
                      <p className="mt-0.5 font-mono text-2xs text-text-muted">
                        {b.bankName} · {b.accountNo}
                        {b.ifsc ? ` · ${b.ifsc}` : ""}
                        {b.upiId ? ` · ${b.upiId}` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditBank(b);
                        setAddBank(false);
                      }}
                    >
                      Edit
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function BranchForm({
  branch,
  pending,
  onSubmit,
}: {
  branch: BranchRow | null;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
}) {
  return (
    <form action={onSubmit} className="space-y-3" key={branch?.id ?? "new"}>
      {branch && <input type="hidden" name="id" value={branch.id} />}

      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <Label htmlFor="code">Code</Label>
          <Input id="code" name="code" required defaultValue={branch?.code ?? ""} placeholder="BOD" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required defaultValue={branch?.name ?? ""} />
        </div>
        <div>
          <Label htmlFor="kind">Type</Label>
          <Select id="kind" name="kind" defaultValue={branch?.kind ?? "store"}>
            <option value="store">Store</option>
            <option value="warehouse">Warehouse</option>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="baddress">Address</Label>
        <Textarea id="baddress" name="address" rows={2} defaultValue={branch?.address ?? ""} />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <Label htmlFor="bphone">Phone</Label>
          <Input id="bphone" name="phone" defaultValue={branch?.phone ?? ""} />
        </div>
        <div>
          <Label htmlFor="bgstin">GSTIN</Label>
          <Input id="bgstin" name="gstin" defaultValue={branch?.gstin ?? ""} />
        </div>
        <div>
          <Label htmlFor="bstate">State</Label>
          <Input id="bstate" name="state" defaultValue={branch?.state ?? ""} />
        </div>
        <div>
          <Label htmlFor="bstateCode">State code</Label>
          <Input id="bstateCode" name="stateCode" defaultValue={branch?.stateCode ?? ""} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="billPrefix">Bill prefix</Label>
          <Input
            id="billPrefix"
            name="billPrefix"
            defaultValue={branch?.billPrefix ?? ""}
            disabled={Boolean(branch && branch.billsIssued > 0)}
          />
          {branch && branch.billsIssued > 0 && (
            <p className="mt-1 text-2xs text-text-muted">
              Locked — {branch.billsIssued} invoice
              {branch.billsIssued === 1 ? " has" : "s have"} already been issued under
              this prefix, and changing it would make them unfindable.
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="billFooter">Invoice footer for this branch</Label>
          <Input id="billFooter" name="billFooter" defaultValue={branch?.billFooter ?? ""} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={branch ? branch.active : true}
          className="size-4 accent-brand"
        />
        Open for business
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : branch ? "Save branch" : "Add branch"}
      </Button>
    </form>
  );
}

function BankForm({
  bank,
  tills,
  pending,
  onSubmit,
}: {
  bank: BankRow | null;
  tills: Array<{ id: string; name: string }>;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
}) {
  return (
    <form action={onSubmit} className="space-y-3" key={bank?.id ?? "new"}>
      {bank && <input type="hidden" name="id" value={bank.id} />}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="label">Label</Label>
          <Input id="label" name="label" required defaultValue={bank?.label ?? ""} placeholder="Current account" />
        </div>
        <div>
          <Label htmlFor="bankName">Bank</Label>
          <Input id="bankName" name="bankName" required defaultValue={bank?.bankName ?? ""} />
        </div>
        <div>
          <Label htmlFor="accountNo">Account number</Label>
          <Input id="accountNo" name="accountNo" required defaultValue={bank?.accountNo ?? ""} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="ifsc">IFSC</Label>
          <Input id="ifsc" name="ifsc" defaultValue={bank?.ifsc ?? ""} />
        </div>
        <div>
          <Label htmlFor="bbranch">Bank branch</Label>
          <Input id="bbranch" name="branch" defaultValue={bank?.branch ?? ""} />
        </div>
        <div>
          <Label htmlFor="upiId">UPI ID</Label>
          <Input id="upiId" name="upiId" defaultValue={bank?.upiId ?? ""} />
        </div>
      </div>

      <div>
        <Label htmlFor="paymentAccountId">Treasury account</Label>
        <Select
          id="paymentAccountId"
          name="paymentAccountId"
          defaultValue={bank?.paymentAccountId ?? ""}
        >
          <option value="">Not linked</option>
          {tills.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-2xs text-text-muted">
          Linking means money landing here is reconciled automatically instead of by hand.
        </p>
      </div>

      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="showOnInvoice"
            defaultChecked={bank?.showOnInvoice ?? false}
            className="size-4 accent-brand"
          />
          Print on invoices
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={bank ? bank.active : true}
            className="size-4 accent-brand"
          />
          Active
        </label>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : bank ? "Save account" : "Add account"}
      </Button>
    </form>
  );
}
