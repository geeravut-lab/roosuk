import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEditableTask } from "./prompt-extra";

// Same promise as the AI settings: a change takes effect within the cache window.
const TTL_MS = 30_000;
let cache: { value: Record<string, string>; at: number } | undefined;

/** The current addition per task (latest version; empty = none). A failed read keeps the last known values. */
export async function loadPromptExtras(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.value;
  try {
    const { data, error } = await createAdminClient()
      .from("ai_prompt_versions")
      .select("id, task, body")
      .order("id", { ascending: false })
      .limit(500)
      .returns<{ id: number; task: string; body: string }[]>();
    if (error) throw error;
    const latest: Record<string, string> = {};
    for (const row of data ?? [])
      if (isEditableTask(row.task) && !(row.task in latest))
        latest[row.task] = row.body;
    cache = { value: latest, at: now };
  } catch (err) {
    console.warn(
      "[ai] could not read ai_prompt_versions, keeping previous values:",
      err,
    );
    cache = { value: cache?.value ?? {}, at: now };
  }
  return cache.value;
}

export function invalidatePromptExtrasCache(): void {
  cache = undefined;
}

export interface PromptVersion {
  id: number;
  task: string;
  body: string;
  created_by: string | null;
  created_at: string;
  review: { verdict?: string; model?: string } | null;
}

export async function recentVersions(
  task: string,
  limit = 5,
): Promise<PromptVersion[]> {
  const { data } = await createAdminClient()
    .from("ai_prompt_versions")
    .select("id, task, body, created_by, created_at, review")
    .eq("task", task)
    .order("id", { ascending: false })
    .limit(limit)
    .returns<PromptVersion[]>();
  return data ?? [];
}
