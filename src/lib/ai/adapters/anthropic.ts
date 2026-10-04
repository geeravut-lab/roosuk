import Anthropic from "@anthropic-ai/sdk";
import {
  AiError,
  type AiRequest,
  type AiResponse,
  type ProviderAdapter,
} from "../types";

const DEFAULT_MAX_TOKENS = 2048;
/** Structured output via a forced tool call: the model must answer with input matching the schema. */
const JSON_TOOL = "record_result";

type Params = Anthropic.MessageCreateParamsNonStreaming;

/** Pure: our request → Anthropic's (images and PDFs go first, then the instruction). */
export function buildAnthropicParams(req: AiRequest, model: string): Params {
  const content: Anthropic.ContentBlockParam[] = [
    ...(req.images ?? []).map((m): Anthropic.ContentBlockParam => ({
      type: "image",
      source: {
        type: "base64",
        media_type: m.mediaType as Anthropic.Base64ImageSource["media_type"],
        data: m.data,
      },
    })),
    ...(req.documents ?? []).map((m): Anthropic.ContentBlockParam => ({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: m.data },
    })),
    { type: "text", text: req.prompt },
  ];

  const params: Params = {
    model,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: [
      ...(req.history ?? []).map((h) => ({ role: h.role, content: h.text })),
      { role: "user", content },
    ],
  };
  if (req.system) params.system = req.system;
  if (req.jsonSchema) {
    params.tools = [
      {
        name: JSON_TOOL,
        description: "Record the result in exactly this structure.",
        input_schema: req.jsonSchema as Anthropic.Tool.InputSchema,
      },
    ];
    params.tool_choice = { type: "tool", name: JSON_TOOL };
  }
  return params;
}

/** Pure: Anthropic's reply → ours. */
export function parseAnthropicResponse(
  res: Anthropic.Message,
  model: string,
  wantsJson: boolean,
): AiResponse {
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const tool = res.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (wantsJson && !tool)
    throw new AiError("bad_output", "model did not return structured output");
  return {
    text: tool ? JSON.stringify(tool.input) : text,
    json: tool?.input,
    provider: "anthropic",
    model,
    usage: {
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    },
  };
}

/** Pinned: the SDK reads ANTHROPIC_BASE_URL, which Netlify's AI Gateway injects (see GOOGLE_BASE_URL). */
export const ANTHROPIC_BASE_URL = "https://api.anthropic.com";

export function createAnthropicAdapter(
  makeClient: (apiKey: string) => Pick<Anthropic, "messages" | "models"> = (
    k,
  ) => new Anthropic({ apiKey: k, baseURL: ANTHROPIC_BASE_URL }),
): ProviderAdapter {
  return {
    id: "anthropic",
    async call(req, model, apiKey) {
      const res = await makeClient(apiKey).messages.create(
        buildAnthropicParams(req, model),
      );
      return parseAnthropicResponse(res, model, !!req.jsonSchema);
    },
    async listModels(apiKey) {
      const ids: string[] = [];
      for await (const m of makeClient(apiKey).models.list({ limit: 100 }))
        ids.push(m.id);
      return ids;
    },
  };
}
