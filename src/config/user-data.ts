/**
 * EVERY place a user's data lives. This list drives the PDPA export and the
 * deletion preview, and a database test (supabase/tests/user-data-coverage.test.ts)
 * fails if a migration adds a table that references a user and nobody adds it
 * here — so a new feature cannot quietly escape "download my data" or "delete my
 * account" (docs/13-data-export-and-deletion.md: owner columns are not always
 * `user_id`, and a guessed list is how data gets left behind).
 */
export interface OwnedTable {
  table: string;
  /** The column holding the owner's id (NOT always `user_id`). */
  column: string;
  /** Columns that name SOMEONE ELSE (e.g. the admin who reviewed) — left out of the user's copy. */
  omit?: readonly string[];
  /** erased: removed with the account (FK cascade) · retained: kept, detached from the person (FK set null). */
  onDelete: "erased" | "retained";
  /** For the deletion dialog: the user's own client can count these (RLS select). */
  countable: boolean;
}

export const OWNED_TABLES: readonly OwnedTable[] = [
  { table: "profiles", column: "id", onDelete: "erased", countable: true },
  {
    table: "consent_records",
    column: "user_id",
    onDelete: "erased",
    countable: true,
  },
  {
    table: "line_links",
    column: "user_id",
    onDelete: "erased",
    countable: true,
  },
  { table: "admins", column: "user_id", onDelete: "erased", countable: true },
  {
    table: "health_profiles",
    column: "user_id",
    onDelete: "erased",
    countable: true,
  },
  {
    table: "daily_checkins",
    column: "user_id",
    onDelete: "erased",
    countable: true,
  },
  {
    table: "action_completions",
    column: "user_id",
    onDelete: "erased",
    countable: true,
  },
  {
    table: "meal_logs",
    column: "user_id",
    onDelete: "erased",
    countable: true,
  },
  {
    table: "lab_reports",
    column: "user_id",
    onDelete: "erased",
    countable: true,
  },
  {
    table: "lab_results",
    column: "user_id",
    onDelete: "erased",
    countable: true,
  },
  {
    table: "quiz_results",
    column: "user_id",
    onDelete: "erased",
    countable: true,
  },
  {
    table: "ai_conversations",
    column: "user_id",
    onDelete: "erased",
    countable: true,
  },
  // Metadata of the files the user chose to keep; the sealed bytes are in Storage and are removed with the account.
  {
    table: "source_files",
    column: "user_id",
    omit: ["object_path"],
    onDelete: "erased",
    countable: true,
  },
  // Usage events (no content): the user's copy is in the export; they go with the account.
  {
    table: "product_events",
    column: "user_id",
    onDelete: "erased",
    countable: false,
  },
  {
    table: "ai_messages",
    column: "user_id",
    onDelete: "erased",
    countable: true,
  },
  { table: "ai_usage", column: "user_id", onDelete: "erased", countable: true },
  {
    table: "app_notifications",
    column: "user_id",
    onDelete: "erased",
    countable: true,
  },
  {
    table: "notification_prefs",
    column: "user_id",
    onDelete: "erased",
    countable: true,
  },
  {
    table: "notification_queue",
    column: "user_id",
    onDelete: "erased",
    countable: false,
  },
  // Money and audit trails outlive the account for bookkeeping — but are detached from the person.
  {
    table: "payments",
    column: "user_id",
    omit: ["reviewed_by"],
    onDelete: "retained",
    countable: true,
  },
  {
    table: "user_subscriptions",
    column: "user_id",
    onDelete: "retained",
    countable: true,
  },
  {
    table: "privacy_audit_log",
    column: "user_id",
    onDelete: "retained",
    countable: false,
  },
];

/**
 * Foreign keys to auth.users that are NOT the user's own data: they name the
 * admin who last edited a setting. Nulled when that admin is deleted.
 */
export const INTERNAL_USER_REFERENCES: readonly string[] = [
  "ai_settings.updated_by",
  "automation_rules.updated_by",
  "notification_settings.updated_by",
  "platform_settings.updated_by",
  "payments.reviewed_by",
];
