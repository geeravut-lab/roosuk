/**
 * Provider-neutral AI types. Feature code talks only to these and to
 * `runAi()` (src/lib/ai/server.ts); the provider SDKs live behind adapters so
 * a provider or model can change from /admin/ai without touching a feature.
 */
export const PROVIDER_IDS = ["anthropic", "google"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** What a call is FOR — picks the provider/model (docs/ROOSUK-MASTER-PLAN.md §8.2). */
export const TASK_KINDS = [
  "food_scan",
  "body_scan",
  "lab_extract",
  "lab_explain",
  "chat",
  "agent",
  "quick",
  "safety",
  "daily_plan",
  "monthly_report",
  "prompt_review",
  "voice_transcribe",
  "doctor_brief",
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export interface AiMedia {
  mediaType: string;
  /** base64, no data: prefix */
  data: string;
}

export interface AiTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AiRequest {
  system?: string;
  /** Earlier turns of a conversation, oldest first; `prompt` is the new user message. */
  history?: AiTurn[];
  prompt: string;
  images?: AiMedia[];
  /** PDFs (mediaType application/pdf). */
  documents?: AiMedia[];
  /** Speech to transcribe (audio/wav). Only some providers take audio. */
  audio?: AiMedia[];
  /** JSON Schema the answer must follow; the adapter enforces it natively. */
  jsonSchema?: Record<string, unknown>;
  maxTokens?: number;
}

export interface AiResponse {
  /** Raw text (for jsonSchema calls: the JSON as text). */
  text: string;
  /** Parsed JSON when a jsonSchema was given and the output parsed. */
  json?: unknown;
  provider: ProviderId;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface ProviderAdapter {
  id: ProviderId;
  call(req: AiRequest, model: string, apiKey: string): Promise<AiResponse>;
  listModels(apiKey: string): Promise<string[]>;
}

/** Error a feature can show without leaking provider details. */
export class AiError extends Error {
  constructor(
    public readonly code:
      "not_configured" | "provider_failed" | "bad_output" | "unsupported",
    message?: string,
    public readonly cause?: unknown,
  ) {
    super(message ?? code);
    this.name = "AiError";
  }
}
