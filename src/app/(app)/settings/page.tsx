import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { can, type Capability } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Settings" };

interface Entry {
  href: string;
  label: string;
  hint: string;
  requires?: Capability;
}

interface Section {
  label: string;
  entries: Entry[];
}

/**
 * One place that answers "where do I change that".
 *
 * Every module grew its own settings page and each one was filed beside
 * the thing it configures, so pricing settings sat under Pricing, comms
 * settings under Utilities, and the chart of accounts under Accounts.
 * Individually sensible; collectively there was no answer to "where are
 * the settings" other than knowing the answer already.
 */
const SECTIONS: Section[] = [
  {
    label: "The business",
    entries: [
      {
        href: ROUTES.company,
        label: "Company",
        hint: "Legal name, GSTIN, home state, and the terms and footer printed on every invoice.",
        requires: "settings.manage",
      },
      {
        href: ROUTES.roles,
        label: "Roles and permissions",
        hint: "What each role can see and do. Cost visibility is decided here.",
        requires: "roles.manage",
      },
      {
        href: ROUTES.staff,
        label: "Staff and logins",
        hint: "Add people, set their role and branch, give them a login, change a password or take access away.",
        requires: "staff.view",
      },
    ],
  },
  {
    label: "What we charge",
    entries: [
      {
        href: ROUTES.pricingSettings,
        label: "Pricing settings",
        hint: "Margin bands, rounding, and how a tag price is worked out from the vendor rate.",
        requires: "pricing.manage",
      },
      {
        href: ROUTES.pricingRules,
        label: "Pricing rules",
        hint: "Per vendor, category and item type overrides to the default margin.",
        requires: "pricing.manage",
      },
      {
        href: ROUTES.discountSettings,
        label: "Discount settings",
        hint: "The floor a discount cannot go below, and who is allowed to give one.",
        requires: "discount.manage",
      },
    ],
  },
  {
    label: "Money",
    entries: [
      {
        href: ROUTES.accounts,
        label: "Chart of accounts",
        hint: "The ledger accounts every posting lands in.",
        requires: "accounts.manage",
      },
      {
        href: ROUTES.taxRates,
        label: "Tax rates",
        hint: "GST rates and the HSN codes they attach to.",
        requires: "accounts.manage",
      },
    ],
  },
  {
    label: "Messages",
    entries: [
      {
        href: ROUTES.commsSettings,
        label: "Comms settings",
        hint: "Which events send a message, and the templates they send.",
        requires: "comms.manage",
      },
      {
        href: ROUTES.whatsapp,
        label: "WhatsApp",
        hint: "Connection, sender number and template approval status.",
        requires: "comms.manage",
      },
    ],
  },
];

export default async function SettingsPage() {
  const user = await requireUser();

  const sections = SECTIONS.map((s) => ({
    ...s,
    entries: s.entries.filter((e) => !e.requires || can(user, e.requires)),
  })).filter((s) => s.entries.length > 0);

  if (sections.length === 0) {
    return (
      <EmptyState
        title="Nothing here for your role"
        hint="Settings are for managers and the owner."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Everything that changes how the system behaves, in one place."
      />

      <div className="space-y-4">
        {sections.map((section) => (
          <Card key={section.label}>
            <CardHeader className="font-medium">{section.label}</CardHeader>
            <CardBody className="p-0">
              <ul className="divide-y divide-border">
                {section.entries.map((e) => (
                  <li key={e.href}>
                    <Link
                      href={e.href}
                      className="flex items-baseline gap-3 px-4 py-3 hover:bg-surface-sunken"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{e.label}</span>
                        <span className="block text-2xs text-text-muted">{e.hint}</span>
                      </span>
                      <span aria-hidden className="text-2xs text-text-subtle">
                        ›
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
