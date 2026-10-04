/**
 * The owner's account. It can never lose admin through the app: the revoke
 * button is not drawn for it, the server action refuses, and the database
 * function behind it refuses too (supabase/migrations/20261029000100_admin_management.sql
 * holds the same address — change both together).
 */
export const PROTECTED_ADMIN_EMAIL = "geeravut@gmail.com";
