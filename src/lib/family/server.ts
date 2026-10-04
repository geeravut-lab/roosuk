import "server-only";
import { bangkokDate } from "@/lib/health/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildSharedView,
  isFamilyScope,
  maskEmail,
  type FamilyScope,
  type SharedView,
} from "./family";

export interface FamilyState {
  role: "owner" | "member" | "none";
  other: {
    id: string;
    name: string | null;
    email: string | null;
    since: string;
  } | null;
  invite: { code: string; expiresAt: string } | null;
  iShare: FamilyScope[];
  theyShare: FamilyScope[];
}

async function describe(userId: string) {
  const { data } = await createAdminClient().auth.admin.getUserById(userId);
  const meta = data.user?.user_metadata as { full_name?: string } | undefined;
  return {
    name: meta?.full_name?.trim() || null,
    email: maskEmail(data.user?.email),
  };
}

/** One person's place in a family, read with the service role after they were identified. */
export async function loadFamily(userId: string): Promise<FamilyState> {
  const db = createAdminClient();
  const [asMember, asOwner] = await Promise.all([
    db
      .from("family_members")
      .select("member_id, owner_id, joined_at")
      .eq("member_id", userId)
      .maybeSingle<{
        member_id: string;
        owner_id: string;
        joined_at: string;
      }>(),
    db
      .from("family_members")
      .select("member_id, owner_id, joined_at")
      .eq("owner_id", userId)
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle<{
        member_id: string;
        owner_id: string;
        joined_at: string;
      }>(),
  ]);
  const link = asMember.data ?? asOwner.data;
  if (!link) {
    const { data: inv } = await db
      .from("family_invites")
      .select("code, expires_at")
      .eq("owner_id", userId)
      .is("revoked_at", null)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ code: string; expires_at: string }>();
    return {
      role: "none",
      other: null,
      invite: inv ? { code: inv.code, expiresAt: inv.expires_at } : null,
      iShare: [],
      theyShare: [],
    };
  }
  const role = asMember.data ? "member" : "owner";
  const otherId = role === "member" ? link.owner_id : link.member_id;
  const { data: shares } = await db
    .from("family_shares")
    .select("direction, scope")
    .eq("member_id", link.member_id)
    .returns<{ direction: string; scope: string }[]>();
  const mine = role === "owner" ? "owner_to_member" : "member_to_owner";
  const pick = (dir: string) =>
    (shares ?? [])
      .filter((s) => s.direction === dir && isFamilyScope(s.scope))
      .map((s) => s.scope as FamilyScope);
  return {
    role,
    other: { id: otherId, ...(await describe(otherId)), since: link.joined_at },
    invite: null,
    iShare: pick(mine),
    theyShare: pick(
      mine === "owner_to_member" ? "member_to_owner" : "owner_to_member",
    ),
  };
}

/** What the other person has switched on for me, and nothing else. */
export async function loadSharedWithMe(
  state: FamilyState,
): Promise<SharedView | null> {
  if (!state.other || state.theyShare.length === 0) return null;
  const { data } = await createAdminClient()
    .from("daily_checkins")
    .select("checkin_date, sleep_band, activity_band, energy, mood, nutrition")
    .eq("user_id", state.other.id)
    .gte(
      "checkin_date",
      new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10),
    )
    .limit(60);
  return buildSharedView(state.theyShare, data ?? [], bangkokDate(new Date()));
}
