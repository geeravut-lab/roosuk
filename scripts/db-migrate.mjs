// Applies supabase/migrations/*.sql to the Supabase project through the
// Management API (HTTPS). Needed because the sandbox cannot reach Postgres
// directly. Tracks applied versions in supabase_migrations.schema_migrations,
// the same table the Supabase CLI uses, so the two stay compatible.
//
//   node scripts/db-migrate.mjs --status   show applied / pending
//   node scripts/db-migrate.mjs            apply everything pending
//
// Needs SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN. Never prints the token.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  listMigrations,
  pendingMigrations,
  sqlString,
} from "./lib/migrations.mjs";

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !token) {
  console.error("Missing SUPABASE_PROJECT_REF and/or SUPABASE_ACCESS_TOKEN.");
  process.exit(1);
}

const DIR = "supabase/migrations";
const statusOnly = process.argv.includes("--status");

async function query(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await res.text();
  if (!res.ok)
    throw new Error(`Management API ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : [];
}

await query(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key,
    statements text[],
    name text
  );
`);

const all = listMigrations(readdirSync(DIR));
const applied = (
  await query(
    "select version from supabase_migrations.schema_migrations order by version",
  )
).map((r) => r.version);
const pending = pendingMigrations(all, applied);

console.log(`applied: ${applied.length}, pending: ${pending.length}`);
for (const m of pending) console.log(`  pending  ${m.version}_${m.name}`);
if (statusOnly || pending.length === 0) process.exit(0);

for (const m of pending) {
  const sql = readFileSync(join(DIR, m.file), "utf8");
  // One request = one implicit transaction: if any statement fails nothing is applied or recorded.
  await query(
    `${sql}\n;\ninsert into supabase_migrations.schema_migrations (version, name) values (${sqlString(m.version)}, ${sqlString(m.name)});`,
  );
  console.log(`  applied  ${m.version}_${m.name}`);
}
