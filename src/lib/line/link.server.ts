import "server-only";
import { classifyLinkConflict, type LinkConflictKind } from "@/lib/line/link";
import { createAdminClient } from "@/lib/supabase/admin";

/** Which kind of account already holds a LINE link (see link.ts). A failed lookup counts as a real account. */
export async function kindOfLinkHolder(
  userId: string,
): Promise<LinkConflictKind> {
  const { data } = await createAdminClient().auth.admin.getUserById(userId);
  return classifyLinkConflict(data.user?.email);
}
