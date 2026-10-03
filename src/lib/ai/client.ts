import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getAiEnv } from "@/lib/env";

/**
 * Model routing per the business model doc: a mid-tier model for health
 * insights/chat, and a small model for cheap tasks (FAQ, short summaries).
 * AI usage is the main variable cost, so pick the cheapest model that holds quality.
 */
export const AI_MODELS = {
  main: "claude-sonnet-5-5",
  light: "claude-haiku-4-5",
} as const;

let client: Anthropic | undefined;

export function getAnthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: getAiEnv().ANTHROPIC_API_KEY });
  return client;
}
