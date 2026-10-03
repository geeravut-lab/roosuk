// Pure helpers for scripts/db-migrate.mjs (kept separate so they can be unit-tested).

const NAME = /^(\d{14})_([a-z0-9_]+)\.sql$/;

/** "20261003000100_phase0_foundation.sql" → { version, name, file } or null. */
export function parseMigrationFile(file) {
  const m = NAME.exec(file);
  return m ? { version: m[1], name: m[2], file } : null;
}

/** Valid migration files in version order. Throws on a name that looks wrong or a duplicate version. */
export function listMigrations(files) {
  const sqlFiles = files.filter((f) => f.endsWith(".sql"));
  const parsed = sqlFiles.map((f) => {
    const p = parseMigrationFile(f);
    if (!p)
      throw new Error(
        `Bad migration file name: ${f} (expected YYYYMMDDHHMMSS_snake_case.sql)`,
      );
    return p;
  });
  parsed.sort((a, b) => a.version.localeCompare(b.version));
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i].version === parsed[i - 1].version) {
      throw new Error(`Duplicate migration version ${parsed[i].version}`);
    }
  }
  return parsed;
}

/** Migrations not yet recorded as applied. Fails if the DB has a version we no longer have a file for. */
export function pendingMigrations(all, appliedVersions) {
  const known = new Set(all.map((m) => m.version));
  const unknown = appliedVersions.filter((v) => !known.has(v));
  if (unknown.length) {
    throw new Error(
      `Database has migrations with no file here: ${unknown.join(", ")}`,
    );
  }
  const applied = new Set(appliedVersions);
  return all.filter((m) => !applied.has(m.version));
}

/** SQL string literal (single quotes doubled). */
export function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
