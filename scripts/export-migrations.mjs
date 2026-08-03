/**
 * Writes migration files from what the DATABASE actually ran.
 *
 * The repo has drifted from the database before, because migrations got
 * rewritten from memory after a session rather than from the recorded
 * SQL. supabase_migrations.schema_migrations stores the exact statements
 * that executed, so that is the only trustworthy source.
 *
 *   node scripts/export-migrations.mjs 20260803224405
 *
 * Pass the first version to export (inclusive). Existing files are not
 * overwritten unless --force is given.
 */
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const from = process.argv[2] ?? "0";
const force = process.argv.includes("--force");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, key, { db: { schema: "supabase_migrations" } });

const { data, error } = await supabase
  .from("schema_migrations")
  .select("version, name, statements")
  .gte("version", from)
  .order("version");

if (error) {
  console.error(error.message);
  process.exit(1);
}

const dir = join(process.cwd(), "supabase", "migrations");
mkdirSync(dir, { recursive: true });

let n = 0;
for (const row of data ?? []) {
  const file = join(dir, `${row.version}_${row.name}.sql`);
  if (existsSync(file) && !force) continue;
  writeFileSync(file, `${(row.statements ?? []).join(";\n")}\n`);
  n += 1;
  console.log(`wrote ${row.version}_${row.name}.sql`);
}
console.log(`\n${n} file(s) written from ${data?.length ?? 0} recorded migrations.`);
