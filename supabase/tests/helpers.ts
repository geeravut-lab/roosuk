import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/**
 * In-memory Postgres with just enough of Supabase stubbed (roles, auth.users,
 * auth.uid()) to apply EVERY migration in order and then exercise RLS as
 * different users — no credentials or network needed.
 */
export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text,
      raw_user_meta_data jsonb default '{}'::jsonb
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    -- Supabase grants new public tables to these roles by default; migrations must revoke what they don't want.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `);
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files)
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  return db;
}

export type Role = "authenticated" | "anon" | "service_role";

/** Run subsequent queries as this user/role (RLS applies unless service_role). */
export async function actAs(
  db: PGlite,
  userId: string | null,
  role: Role = "authenticated",
) {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub', '${userId ?? ""}', false); set role ${role};`,
  );
}

export async function actAsOwner(db: PGlite) {
  await db.exec("reset role");
}

/** True if the statement is rejected by a privilege, RLS or constraint error. */
export async function isRejected(
  db: PGlite,
  sql: string,
  params: unknown[] = [],
): Promise<boolean> {
  try {
    await db.query(sql, params);
    return false;
  } catch (e) {
    const message = (e as Error).message;
    if (
      /permission denied|row-level security|violates|invalid input/.test(
        message,
      )
    )
      return true;
    throw e; // a syntax error or the like must fail the test, not count as "rejected"
  }
}
