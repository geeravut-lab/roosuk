import type { Metadata } from "next";
import { newConversationAction } from "@/app/actions/ask";
import { requireUser } from "@/lib/auth/server";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { AskForm } from "./AskForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).askTitle };
}

interface Msg {
  id: number;
  role: "user" | "assistant";
  content: string;
  flag: string | null;
}

export default async function AskPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const t = await getT();

  // The user's own client: RLS returns only their conversations.
  const { data: conv } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("user_id", user.id)
    .eq("kind", "chat")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  const { data: messages } = conv
    ? await supabase
        .from("ai_messages")
        .select("id, role, content, flag")
        .eq("conversation_id", conv.id)
        .order("id", { ascending: true })
        .limit(100)
        .returns<Msg[]>()
    : { data: [] as Msg[] };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">{t.askTitle}</h1>
        <p className="text-muted">{t.askIntro}</p>
      </div>

      {(messages ?? []).length === 0 ? (
        <p className="card">{t.askEmpty}</p>
      ) : (
        <ol className="space-y-3" aria-label={t.askTitle}>
          {(messages ?? []).map((m) => {
            const emergency =
              m.flag === "emergency" ||
              m.flag === "medical_emergency" ||
              m.flag === "self_harm";
            return (
              <li
                key={m.id}
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

      <AskForm />

      <div className="flex items-center justify-between gap-3">
        <p className="text-muted text-xs">{t.askHistoryNote}</p>
        <form action={newConversationAction}>
          <button type="submit" className="btn btn-ghost shrink-0">
            {t.askNew}
          </button>
        </form>
      </div>
    </div>
  );
}
