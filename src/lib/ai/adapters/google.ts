import {
  GoogleGenAI,
  ThinkingLevel,
  type GenerateContentResponse,
} from "@google/genai";
import {
  AiError,
  type AiRequest,
  type AiResponse,
  type ProviderAdapter,
} from "../types";

const DEFAULT_MAX_TOKENS = 2048;
/**
 * Gemini 3 / Flash models "think" before answering and COUNT those thinking
 * tokens against maxOutputTokens: a 1024-token limit was measured spending 873
 * on thinking, leaving a long answer truncated into invalid JSON. So thinking is
 * set to LOW (accepted by every current Flash / Flash-Lite model; probed
 * 2026-10-11) and the limit gets headroom on top of what the caller asked for.
 */
const THINKING_HEADROOM = 2048;
const SUPPORTS_THINKING_LEVEL = /^gemini-(3|flash)/;
const NON_TEXT = /tts|image|embedding|live|audio|robotics|computer-use/i;

/**
 * Health data must go through a PAID Gemini key (billing on): the free tier may
 * use prompts to improve Google's products. The key is validated in /admin/ai,
 * but which tier it is can only be confirmed in Google AI Studio.
 */
export function buildGoogleParams(req: AiRequest, model: string) {
  const media = [...(req.images ?? []), ...(req.documents ?? [])].map((m) => ({
    inlineData: { mimeType: m.mediaType, data: m.data },
  }));
  return {
    model,
    contents: [
      ...(req.history ?? []).map((h) => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.text }],
      })),
      { role: "user", parts: [...media, { text: req.prompt }] },
    ],
    config: {
      maxOutputTokens:
        (req.maxTokens ?? DEFAULT_MAX_TOKENS) + THINKING_HEADROOM,
      ...(SUPPORTS_THINKING_LEVEL.test(model)
        ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
        : {}),
      ...(req.system ? { systemInstruction: req.system } : {}),
      ...(req.jsonSchema
        ? {
            responseMimeType: "application/json",
            responseJsonSchema: req.jsonSchema,
          }
        : {}),
    },
  };
}

export function parseGoogleResponse(
  res: GenerateContentResponse,
  model: string,
  wantsJson: boolean,
): AiResponse {
  const text = res.text ?? "";
  let json: unknown;
  if (wantsJson) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new AiError("bad_output", "model did not return valid JSON");
    }
  }
  return {
    text,
    json,
    provider: "google",
    model,
    usage: {
      inputTokens: res.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

export function createGoogleAdapter(
  makeClient: (apiKey: string) => Pick<GoogleGenAI, "models"> = (k) =>
    new GoogleGenAI({ apiKey: k }),
): ProviderAdapter {
  return {
    id: "google",
    async call(req, model, apiKey) {
      const res = await makeClient(apiKey).models.generateContent(
        buildGoogleParams(req, model),
      );
      return parseGoogleResponse(res, model, !!req.jsonSchema);
    },
    async listModels(apiKey) {
      const ids: string[] = [];
      const pager = await makeClient(apiKey).models.list({
        config: { pageSize: 100 },
      });
      for await (const m of pager) {
        const name = (m.name ?? "").replace(/^models\//, "");
        const canGenerate =
          !m.supportedActions || m.supportedActions.includes("generateContent");
        // Text/vision models only: the list also holds TTS, image-generation and live-audio models.
        if (name.startsWith("gemini") && canGenerate && !NON_TEXT.test(name))
          ids.push(name);
      }
      return ids;
    },
  };
}
