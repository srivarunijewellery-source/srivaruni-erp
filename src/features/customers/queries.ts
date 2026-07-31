import { createClient } from "@/lib/supabase/server";

export interface Customer {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  dob: string | null;
  anniversary: string | null;
  gstin: string | null;
  pan: string | null;
  city: string | null;
  notes: string | null;
  createdAt: string;
}

const SELECT =
  "id, phone, name, email, dob, anniversary, gstin, pan, city, notes, created_at" as const;

type Row = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  dob: string | null;
  anniversary: string | null;
  gstin: string | null;
  pan: string | null;
  city: string | null;
  notes: string | null;
  created_at: string;
};

function toCustomer(r: Row): Customer {
  return {
    id: r.id,
    phone: r.phone,
    name: r.name,
    email: r.email,
    dob: r.dob,
    anniversary: r.anniversary,
    gstin: r.gstin,
    pan: r.pan,
    city: r.city,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

/**
 * Search by name or phone.
 *
 * Runs through the search_customers function rather than a query-builder
 * chain because staff look people up by the last few digits of a number
 * ("it ended 3210"), which needs both a prefix and a suffix match on the
 * normalised digits -- awkward to express safely through .or() string
 * interpolation, and a place user input could leak into a filter.
 */
export async function listCustomers(query = "", limit = 50): Promise<Customer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_customers", {
    p_query: query,
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toCustomer);
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? toCustomer(data as Row) : null;
}

/** Upcoming birthdays and anniversaries, for the campaigns that come later. */
export async function listUpcomingOccasions(withinDays = 30): Promise<
  Array<{ customer: Customer; occasion: "birthday" | "anniversary"; date: string }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select(SELECT)
    .or("dob.not.is.null,anniversary.not.is.null");

  if (error) throw error;

  const now = new Date();
  // Midnight, not "now". Comparing a date against a timestamp with a time
  // component pushes an occasion falling TODAY into next year -- which is
  // precisely the day a birthday campaign exists to catch.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out: Array<{ customer: Customer; occasion: "birthday" | "anniversary"; date: string }> = [];

  // Day-of-year maths in JS rather than SQL: the "next occurrence of a
  // recurring month-day" comparison is fiddly across a year boundary, and
  // the customer list is small enough that filtering here is cheaper than
  // getting a clever date expression subtly wrong.
  for (const row of (data ?? []) as Row[]) {
    const customer = toCustomer(row);
    for (const [occasion, value] of [
      ["birthday", row.dob],
      ["anniversary", row.anniversary],
    ] as const) {
      if (!value) continue;

      // Split the ISO string by hand rather than new Date(value). Date
      // parses "1990-07-31" as UTC midnight, but getMonth/getDate read it
      // back in local time -- so anywhere behind UTC the 31st becomes the
      // 30th. The owner works from US Pacific, so this is not theoretical.
      const [, month, day] = value.split("-").map(Number);
      if (!month || !day) continue;

      const next = new Date(today.getFullYear(), month - 1, day);
      if (next < today) next.setFullYear(next.getFullYear() + 1);
      const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);
      if (days <= withinDays) {
        // Format from the parts, not toISOString, for the same reason.
        const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
        out.push({ customer, occasion, date: iso });
      }
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}
