// Makes an existing user an admin (inserts into public.admins with the service role).
//   node scripts/grant-admin.mjs someone@example.com
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Never prints keys.
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !url || !key) {
  console.error(
    "Usage: node scripts/grant-admin.mjs <email>  (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let userId;
for (let page = 1; !userId; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page,
    perPage: 200,
  });
  if (error) throw error;
  userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
  if (data.users.length < 200) break;
}
if (!userId) {
  console.error(
    `No user with email ${email}. Sign up first, then run this again.`,
  );
  process.exit(1);
}

const { data, error } = await supabase
  .from("admins")
  .upsert({ user_id: userId })
  .select("user_id");
// An upsert that touches no row would also look like success — count it.
if (error || data?.length !== 1)
  throw error ?? new Error("admin row was not written");
console.log(`${email} is now an admin.`);
