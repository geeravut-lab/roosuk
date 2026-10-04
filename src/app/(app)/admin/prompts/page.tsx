import type { Metadata } from "next";
import { isEditableTask } from "@/lib/ai/prompt-extra";
import {
  invalidatePromptExtrasCache,
  loadPromptExtras,
  recentVersions,
} from "@/lib/ai/prompt-extra.server";
import { builtinPrompt, guardrailKey } from "@/lib/ai/prompt-view";
import { TASK_KINDS } from "@/lib/ai/types";
import { fmt } from "@/lib/i18n/dict";
import { formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PromptForm } from "./PromptForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminPromptsTitle };
}

export default async function AdminPromptsPage() {
  // The admin just changed something: show the truth, not a 30-second-old copy.
  invalidatePromptExtrasCache();
  const [t, lang, extras] = await Promise.all([
    getT(),
    getLang(),
    loadPromptExtras(),
  ]);
  const versions = Object.fromEntries(
    await Promise.all(
      TASK_KINDS.filter(isEditableTask).map(
        async (task) => [task, await recentVersions(task)] as const,
      ),
    ),
  );
  // Names of the admins who edited (service role; this page is behind requireAdmin).
  const authorIds = [
    ...new Set(
      Object.values(versions)
        .flat()
        .map((v) => v.created_by)
        .filter((x): x is string => !!x),
    ),
  ];
  const db = createAdminClient();
  const authors = new Map(
    await Promise.all(
      authorIds.map(async (id) => {
        const u = (await db.auth.admin.getUserById(id)).data.user;
        return [id, u?.email ?? ""] as const;
      }),
    ),
  );

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.adminPromptsTitle}
        </h1>
        <p className="text-muted text-sm">{t.adminPromptsHint}</p>
      </div>

      <ul className="space-y-4">
        {TASK_KINDS.map((task) => {
          const builtin = builtinPrompt(task);
          const editable = isEditableTask(task);
          const rules = t[guardrailKey(task)].split("\n");
          return (
            <li key={task} className="card space-y-3">
              <h2 className="text-lg font-semibold">
                {t[`aiTask_${task}` as const]}
              </h2>

              {builtin ? (
                <details>
                  <summary className="text-primary-strong min-h-11 cursor-pointer py-2 font-semibold">
                    {t.promptBuiltin}
                  </summary>
                  <pre
                    tabIndex={0}
                    role="region"
                    aria-label={t.promptBuiltin}
                    className="bg-tint-primary max-h-80 overflow-auto rounded-xl p-3 text-xs break-words whitespace-pre-wrap"
                  >
                    {builtin.system}
                  </pre>
                  <p className="mt-2 text-sm font-semibold">{t.promptInput}</p>
                  <pre
                    tabIndex={0}
                    role="region"
                    aria-label={t.promptInput}
                    className="bg-tint-primary max-h-60 overflow-auto rounded-xl p-3 text-xs break-words whitespace-pre-wrap"
                  >
                    {builtin.input}
                  </pre>
                </details>
              ) : null}

              <div>
                <p className="text-sm font-semibold">{t.promptGuardrails}</p>
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {rules.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>

              {editable ? (
                <>
                  <PromptForm task={task} saved={extras[task] ?? ""} />
                  <details>
                    <summary className="text-muted min-h-11 cursor-pointer py-2 text-sm font-semibold">
                      {t.promptHistory}
                    </summary>
                    {versions[task]?.length ? (
                      <ul className="space-y-1.5 text-sm">
                        {versions[task].map((v) => (
                          <li
                            key={v.id}
                            className="border-line rounded-lg border p-2"
                          >
                            <p className="text-muted">
                              {fmt(t.promptHistoryRow, {
                                when: formatDateTime(lang, v.created_at),
                                who:
                                  (v.created_by && authors.get(v.created_by)) ||
                                  "—",
                              })}
                            </p>
                            <p className="break-words whitespace-pre-wrap">
                              {v.body || t.promptHistoryCleared}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm">{t.promptHistoryNone}</p>
                    )}
                  </details>
                </>
              ) : (
                <p className="text-muted text-sm">
                  {task === "prompt_review"
                    ? t.promptReviewerNote
                    : t.promptNotInUse}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
