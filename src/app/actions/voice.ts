"use server";

import { runAi } from "@/lib/ai/server";
import { AiError } from "@/lib/ai/types";
import { trackEvent } from "@/lib/analytics/server";
import { requireUser } from "@/lib/auth/server";
import { checkAndConsume, refundUsage } from "@/lib/billing/quota.server";
import { AppError } from "@/lib/errors";
import { assertFeature } from "@/lib/flags/server";
import type { ErrorKey } from "@/lib/i18n/dict";
import {
  MAX_BYTES,
  TRANSCRIBE_PROMPT,
  TRANSCRIBE_SCHEMA,
  TRANSCRIBE_SYSTEM,
  checkWav,
  normalizeTranscript,
} from "@/lib/voice/voice";

export type VoiceResult = { text: string } | { error: ErrorKey };

/**
 * A recording → text for the person to check. Same order as every AI feature:
 * feature switch → validate the real bytes → quota → provider → refund when
 * nothing came back. The audio lives only in this function's memory.
 */
export async function transcribeVoiceAction(
  formData: FormData,
): Promise<VoiceResult> {
  try {
    await assertFeature("voice");
    const user = await requireUser();
    const file = formData.get("audio");
    if (!(file instanceof File) || file.size === 0)
      return { error: "err_voice_audio" };
    if (file.size > MAX_BYTES + 4096) return { error: "err_voice_long" };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkWav(bytes);
    if (!check.ok)
      return {
        error:
          check.reason === "long"
            ? "err_voice_long"
            : check.reason === "short"
              ? "err_voice_short"
              : "err_voice_audio",
      };

    const decision = await checkAndConsume(user.id, "voice");
    if (!decision.allowed) return { error: decision.error };

    let text: string | null = null;
    try {
      const ai = await runAi("voice_transcribe", {
        system: TRANSCRIBE_SYSTEM,
        prompt: TRANSCRIBE_PROMPT,
        audio: [
          {
            mediaType: "audio/wav",
            data: Buffer.from(bytes).toString("base64"),
          },
        ],
        jsonSchema: TRANSCRIBE_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 600,
      });
      text = normalizeTranscript(ai.json);
    } catch (err) {
      await refundUsage(user.id, "voice");
      console.error(
        "[voice] transcription failed:",
        err instanceof AiError ? err.code : err,
      );
      return { error: "err_ai_unavailable" };
    }
    if (!text) {
      await refundUsage(user.id, "voice");
      return { error: "err_voice_nospeech" };
    }
    await trackEvent("voice_used", user.id);
    return { text };
  } catch (err) {
    return { error: err instanceof AppError ? err.code : "err_unknown" };
  }
}
