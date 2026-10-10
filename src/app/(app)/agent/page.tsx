import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crown, Wrench } from "lucide-react";
import {
  cancelReminderAction,
  newAgentConversationAction,
} from "@/app/actions/agent";
import { SubmitButton } from "@/components/SubmitButton";
import { agentAllowed } from "@/lib/agent/server";
import { requireUser } from "@/lib/auth/server";
import { featureEnabled } from "@/lib/flags/server";
import { bangkokDate } from "@/lib/health/dates";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { AgentForm } from "./AgentForm";
import { ScrollToLatest } from "@/components/ScrollToLatest";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).agentTitle };
}

interface Msg {
  id: number;
  role: "user" | "assistant";
  content: string;
  flag: string | null;
}

export default async function AgentPage() {
  if (!(await featureEnabled("health_agent"))) notFound();
  const user = await requireUser();
  const supabase = await createClient();
  const [t, lang, allowed] = await Promise.all([
    getT(),
    getLang(),
    agentAllowed(user.id),
  ]);

  const { data: conv } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("user_id", user.id)
    .eq("kind", "agent")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  const [{ data: messages }, { data: reminders }] = await Promise.all([
    conv
      ? supabase
          .from("ai_messages")
          .select("id, role, content, flag")
          .eq("conversation_id", conv.id)
          .order("id", { ascending: true })
          .limit(100)
          .returns<Msg[]>()
      : Promise.resolve({ data: [] as Msg[] }),
    supabase
      .from("agent_reminders")
      .select("id, remind_on, text")
      .is("notified_at", null)
      .gte("remind_on", bangkokDate(new Date()))
      .order("remind_on", { ascending: true })
      .limit(30)
      .returns<{ id: string; remind_on: string; text: string }[]>(),
  ]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.agentTitle}
        </h1>
        <p className="text-muted">{t.agentIntro}</p>
      </div>

      {!allowed ? (
        <section className="card space-y-2" aria-labelledby="agent-plan">
          <h2
            id="agent-plan"
            className="inline-flex items-center gap-2 font-semibold"
          >
            <Crown className="text-primary-strong size-5" aria-hidden />
            {t.agentPlanTitle}
          </h2>
          <p>{t.agentPlanBody}</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/subscription" className="btn btn-primary">
              {t.passportUpgrade}
            </Link>
            <Link href="/ask" className="btn btn-secondary">
              {t.askTitle}
            </Link>
          </div>
        </section>
      ) : (
        <>
          {(messages ?? []).length === 0 ? (
            <p className="card">{t.agentEmpty}</p>
          ) : (
            <ol className="space-y-3" aria-label={t.agentTitle}>
              {(messages ?? []).map((m, i, all) => {
                const last = i === all.length - 1;
                if (m.flag === "tool") {
                  const [tool, ...rest] = m.content.split(": ");
                  const label = t[`agentAction_${tool}` as keyof Dict] as
                    string | undefined;
                  return (
                    <li
                      key={m.id}
                      data-chat-last={last ? "" : undefined}
                      className="text-muted flex items-start gap-2 px-2 text-sm"
                    >
                      <Wrench className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>
                        {label ?? tool}
                        {rest.length ? ` — ${rest.join(": ")}` : ""}
                      </span>
                    </li>
                  );
                }
                const emergency =
                  m.flag === "emergency" ||
                  m.flag === "medical_emergency" ||
                  m.flag === "self_harm";
                return (
                  <li
                    key={m.id}
                    data-chat-last={last ? "" : undefined}
                    className={`card space-y-2 ${
                      m.role === "user"
                        ? "bg-tint-primary ml-6"
                        : emergency
                          ? "border-danger mr-6 border-2"
                          : "mr-6"
                    }`}
                  >
                    <p className="text-muted text-xs font-semibold">
                      {m.role === "user" ? t.askYou : t.askAssistant}
                    </p>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.role === "assistant" ? (
                      <>
                        {m.flag === "see_doctor" ? (
                          <p className="bg-tint-warn rounded-lg px-2.5 py-1.5 text-sm font-medium">
                            {t.askSeeDoctor}
                          </p>
                        ) : null}
                        {m.flag === "low_confidence" ? (
                          <p className="bg-tint-warn rounded-lg px-2.5 py-1.5 text-sm font-medium">
                            {t.askLowConfidence}
                          </p>
                        ) : null}
                        <p className="text-muted text-xs">{t.askDisclaimer}</p>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}

          <ScrollToLatest count={(messages ?? []).length} />
          <AgentForm />

          <section className="card space-y-2" aria-labelledby="agent-rem">
            <h2 id="agent-rem" className="font-semibold">
              {t.agentRemindersTitle}
            </h2>
            {(reminders ?? []).length === 0 ? (
              <p className="text-muted text-sm">{t.agentRemindersNone}</p>
            ) : (
              <ul className="divide-line divide-y">
                {(reminders ?? []).map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div>
                      <p className="font-medium">{r.text}</p>
                      <p className="text-muted text-sm">
                        {fmt(t.agentReminderOn, {
                          date: formatDate(lang, r.remind_on),
                        })}
                      </p>
                    </div>
                    <form action={cancelReminderAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <SubmitButton className="btn btn-secondary">
                        {t.agentReminderCancel}
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="flex items-center justify-between gap-3">
            <p className="text-muted text-xs">{t.agentHistoryNote}</p>
            <form action={newAgentConversationAction}>
              <SubmitButton className="btn btn-ghost shrink-0">
                {t.agentNew}
              </SubmitButton>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
