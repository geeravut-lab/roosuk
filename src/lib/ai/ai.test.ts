import { describe, expect, it, vi } from "vitest";
import {
  buildAnthropicParams,
  parseAnthropicResponse,
} from "./adapters/anthropic";
import { buildGoogleParams, parseGoogleResponse } from "./adapters/google";
import { PROVIDERS, TASK_ROUTES, apiKeyFor } from "./registry";
import { runAiWith, type AiEventInput, type RunDeps } from "./run";
import {
  DEFAULT_AI_SETTINGS,
  parseAiSettings,
  resolveRoute,
  shouldTryFallback,
} from "./route";
import {
  AiError,
  TASK_KINDS,
  type AiRequest,
  type ProviderAdapter,
  type ProviderId,
} from "./types";

const both = () => true;

describe("registry", () => {
  it("has a default model and route for every task", () => {
    for (const task of TASK_KINDS) {
      expect(TASK_ROUTES[task]).toBeDefined();
      for (const p of Object.values(PROVIDERS))
        expect(p.models[task]).toBeTruthy();
    }
  });
  it("sends food scans to Gemini and lab reading to Claude by default (§8.2)", () => {
    expect(TASK_ROUTES.food_scan.primary).toBe("google");
    expect(TASK_ROUTES.lab_extract.primary).toBe("anthropic");
    expect(PROVIDERS.anthropic.models.lab_extract).toBe("claude-sonnet-5-5");
    expect(PROVIDERS.anthropic.models.quick).toBe("claude-haiku-4-5");
  });
  it("never defaults to the most expensive model (docs/10, docs/11)", () => {
    for (const p of Object.values(PROVIDERS))
      for (const m of Object.values(p.models))
        expect(m).not.toMatch(/opus|pro/i);
  });
  it("reads keys by env name and treats blank as missing", () => {
    expect(apiKeyFor("anthropic", { ANTHROPIC_API_KEY: " k " })).toBe("k");
    expect(apiKeyFor("anthropic", { ANTHROPIC_API_KEY: "  " })).toBeNull();
    expect(apiKeyFor("google", {})).toBeNull();
  });
});

describe("parseAiSettings", () => {
  it("gives the defaults for a missing or junk row", () => {
    expect(parseAiSettings(null)).toEqual(DEFAULT_AI_SETTINGS);
    expect(
      parseAiSettings({ route_overrides: "x", model_overrides: 5 }).routes,
    ).toEqual({});
  });
  it("keeps valid entries and drops unknown tasks, providers and bad model ids", () => {
    const s = parseAiSettings({
      route_overrides: {
        chat: { primary: "google", fallback: "none" },
        nope: { primary: "google" },
        quick: { primary: "openai" },
      },
      model_overrides: {
        google: { chat: "gemini-x.1", quick: "bad model!" },
        openai: { chat: "gpt" },
      },
      updated_by: "u1",
      updated_at: "2026-10-07T00:00:00Z",
    });
    expect(s.routes).toEqual({ chat: { primary: "google", fallback: "none" } });
    expect(s.models).toEqual({ google: { chat: "gemini-x.1" } });
    expect(s.updatedBy).toBe("u1");
  });
});

describe("resolveRoute", () => {
  it("uses the code defaults when nothing is configured", () => {
    const r = resolveRoute("food_scan", DEFAULT_AI_SETTINGS, both)!;
    expect(r.primary.provider).toBe("google");
    expect(r.fallback?.provider).toBe("anthropic");
    expect(r.primarySkipped).toBeNull();
  });
  it("applies admin overrides for providers and models", () => {
    const settings = parseAiSettings({
      route_overrides: { chat: { primary: "google", fallback: "anthropic" } },
      model_overrides: { google: { chat: "gemini-custom" } },
    });
    const r = resolveRoute("chat", settings, both)!;
    expect(r.primary).toEqual({ provider: "google", model: "gemini-custom" });
    expect(r.fallback?.provider).toBe("anthropic");
  });
  it('turns the fallback off with "none" and ignores a fallback equal to the primary', () => {
    const none = parseAiSettings({
      route_overrides: { chat: { fallback: "none" } },
    });
    expect(resolveRoute("chat", none, both)!.fallback).toBeNull();
    const same = parseAiSettings({
      route_overrides: { chat: { primary: "google", fallback: "google" } },
    });
    expect(resolveRoute("chat", same, both)!.fallback).toBeNull();
  });
  it("replaces a primary without a key by the fallback and reports it", () => {
    const r = resolveRoute(
      "food_scan",
      DEFAULT_AI_SETTINGS,
      (p) => p === "anthropic",
    )!;
    expect(r.primary.provider).toBe("anthropic");
    expect(r.primary.model).toBe(PROVIDERS.anthropic.models.food_scan);
    expect(r.fallback).toBeNull();
    expect(r.primarySkipped).toBe("google");
  });
  it("uses any provider with a key when the task has no fallback, and drops a keyless fallback", () => {
    const r = resolveRoute(
      "agent",
      DEFAULT_AI_SETTINGS,
      (p) => p === "google",
    )!;
    expect(r.primary.provider).toBe("google");
    expect(r.primarySkipped).toBe("anthropic");
    const r2 = resolveRoute(
      "chat",
      DEFAULT_AI_SETTINGS,
      (p) => p === "anthropic",
    )!;
    expect(r2.primary.provider).toBe("anthropic");
    expect(r2.fallback).toBeNull();
    expect(r2.primarySkipped).toBeNull();
  });
  it("returns null when no provider has a key", () => {
    expect(resolveRoute("chat", DEFAULT_AI_SETTINGS, () => false)).toBeNull();
  });
});

describe("shouldTryFallback", () => {
  it("retries on rate limits, server errors, dead keys and network failures", () => {
    for (const status of [429, 500, 503, 401, 403])
      expect(shouldTryFallback({ status })).toBe(true);
    expect(shouldTryFallback(new Error("fetch failed"))).toBe(true);
    expect(shouldTryFallback({ code: "ETIMEDOUT" })).toBe(true);
  });
  it("does not retry our own bad requests", () => {
    for (const status of [400, 404, 422])
      expect(shouldTryFallback({ status })).toBe(false);
    expect(shouldTryFallback(new Error("schema invalid"))).toBe(false);
    expect(shouldTryFallback(null)).toBe(false);
  });
});

describe("adapters (pure parts)", () => {
  const req: AiRequest = {
    system: "sys",
    prompt: "read this",
    images: [{ mediaType: "image/jpeg", data: "AAA" }],
    documents: [{ mediaType: "application/pdf", data: "BBB" }],
    jsonSchema: { type: "object", properties: { a: { type: "string" } } },
    maxTokens: 500,
  };

  it("builds an Anthropic request: media first, forced tool for JSON, system and limits", () => {
    const p = buildAnthropicParams(req, "claude-x");
    expect(p).toMatchObject({
      model: "claude-x",
      max_tokens: 500,
      system: "sys",
      tool_choice: { type: "tool", name: "record_result" },
    });
    const content = p.messages[0].content as { type: string }[];
    expect(content.map((c) => c.type)).toEqual(["image", "document", "text"]);
    expect(p.tools?.[0]).toMatchObject({
      name: "record_result",
      input_schema: req.jsonSchema,
    });
  });
  it("passes earlier turns to both providers in order, with each provider's role names", () => {
    const withHistory: AiRequest = {
      prompt: "and now?",
      history: [
        { role: "user", text: "first" },
        { role: "assistant", text: "answer" },
      ],
    };
    const a = buildAnthropicParams(withHistory, "m");
    expect(a.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
    expect(a.messages[0].content).toBe("first");
    const g = buildGoogleParams(withHistory, "m");
    expect(g.contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
    expect(g.contents[2].parts).toEqual([{ text: "and now?" }]);
    // no history = a single user turn
    expect(buildGoogleParams({ prompt: "x" }, "m").contents).toHaveLength(1);
  });

  it("builds a plain Anthropic request without tools", () => {
    const p = buildAnthropicParams({ prompt: "hi" }, "m");
    expect(p.tools).toBeUndefined();
    expect(p.max_tokens).toBe(2048);
    expect(p.system).toBeUndefined();
  });
  it("parses Anthropic text and structured replies, and rejects a missing tool call", () => {
    const text = parseAnthropicResponse(
      {
        content: [{ type: "text", text: "hi" }],
        usage: { input_tokens: 3, output_tokens: 2 },
      } as never,
      "m",
      false,
    );
    expect(text).toMatchObject({
      text: "hi",
      provider: "anthropic",
      usage: { inputTokens: 3, outputTokens: 2 },
    });
    const json = parseAnthropicResponse(
      {
        content: [
          {
            type: "tool_use",
            id: "1",
            name: "record_result",
            input: { a: "x" },
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1 },
      } as never,
      "m",
      true,
    );
    expect(json.json).toEqual({ a: "x" });
    expect(() =>
      parseAnthropicResponse(
        {
          content: [{ type: "text", text: "no" }],
          usage: { input_tokens: 0, output_tokens: 0 },
        } as never,
        "m",
        true,
      ),
    ).toThrow(AiError);
  });

  it("builds a Gemini request with inline media and a JSON schema", () => {
    const p = buildGoogleParams(req, "gemini-x");
    expect(p.model).toBe("gemini-x");
    expect(p.contents[0].parts).toHaveLength(3);
    expect(p.config).toMatchObject({
      systemInstruction: "sys",
      maxOutputTokens: 500 + 2048, // headroom: Gemini counts thinking tokens in the limit
      responseMimeType: "application/json",
      responseJsonSchema: req.jsonSchema,
    });
  });
  it("lowers thinking on Gemini 3 / Flash models only", () => {
    for (const m of [
      "gemini-3-flash-preview",
      "gemini-flash-latest",
      "gemini-flash-lite-latest",
    ])
      expect(buildGoogleParams({ prompt: "x" }, m).config).toHaveProperty(
        "thinkingConfig.thinkingLevel",
        "LOW",
      );
    expect(
      buildGoogleParams({ prompt: "x" }, "gemini-2.0-pro").config,
    ).not.toHaveProperty("thinkingConfig");
  });
  it("parses Gemini replies and rejects invalid JSON", () => {
    const ok = parseGoogleResponse(
      {
        text: '{"a":"x"}',
        usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 5 },
      } as never,
      "g",
      true,
    );
    expect(ok).toMatchObject({
      json: { a: "x" },
      usage: { inputTokens: 4, outputTokens: 5 },
    });
    expect(() =>
      parseGoogleResponse({ text: "not json" } as never, "g", true),
    ).toThrow(AiError);
    expect(
      parseGoogleResponse({ text: "plain" } as never, "g", false).json,
    ).toBeUndefined();
  });
});

describe("runAiWith", () => {
  const ok = (provider: ProviderId): ProviderAdapter => ({
    id: provider,
    call: vi.fn(async (_r, model) => ({
      text: "ok",
      provider,
      model,
      usage: { inputTokens: 1, outputTokens: 1 },
    })),
    listModels: vi.fn(async () => []),
  });
  const failing = (provider: ProviderId, error: unknown): ProviderAdapter => ({
    id: provider,
    call: vi.fn(async () => {
      throw error;
    }),
    listModels: vi.fn(async () => []),
  });
  const make = (
    adapters: Record<ProviderId, ProviderAdapter>,
    keys: ProviderId[] = ["anthropic", "google"],
  ) => {
    const events: AiEventInput[] = [];
    const deps: RunDeps = {
      loadSettings: async () => DEFAULT_AI_SETTINGS,
      apiKey: (p) => (keys.includes(p) ? "k" : null),
      adapters,
      logEvent: async (e) => void events.push(e),
      sleep: async () => {},
    };
    return { deps, events };
  };
  const req: AiRequest = { prompt: "x" };

  it("returns the primary's answer and logs nothing on success", async () => {
    const a = { anthropic: ok("anthropic"), google: ok("google") };
    const { deps, events } = make(a);
    const res = await runAiWith(deps, "food_scan", req);
    expect(res.provider).toBe("google");
    expect(a.anthropic.call).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("falls back once on a retryable error and logs the switch (no prompt text)", async () => {
    const a = {
      anthropic: ok("anthropic"),
      google: failing("google", { status: 429, message: "rate limited" }),
    };
    const { deps, events } = make(a);
    const res = await runAiWith(deps, "food_scan", {
      prompt: "SECRET MEAL PHOTO NOTES",
    });
    expect(res.provider).toBe("anthropic");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      provider: "google",
      task: "food_scan",
      status: "fallback",
      errorCode: "429",
    });
    expect(JSON.stringify(events)).not.toContain("SECRET");
  });

  it("retries a 503 once on the same provider before switching", async () => {
    const flaky: ProviderAdapter = {
      id: "google",
      listModels: vi.fn(async () => []),
      call: vi
        .fn()
        .mockRejectedValueOnce({ status: 503 })
        .mockResolvedValueOnce({
          text: "ok",
          provider: "google",
          model: "m",
          usage: { inputTokens: 1, outputTokens: 1 },
        }),
    };
    const a = { anthropic: ok("anthropic"), google: flaky };
    const { deps, events } = make(a);
    expect((await runAiWith(deps, "food_scan", req)).provider).toBe("google");
    expect(flaky.call).toHaveBeenCalledTimes(2);
    expect(a.anthropic.call).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("flags a free-tier key by name, whatever the status code", async () => {
    const freeTier = {
      status: 429,
      message:
        "Quota exceeded for metric: generate_content_free_tier_requests, limit: 20",
    };
    const a = {
      anthropic: ok("anthropic"),
      google: failing("google", freeTier),
    };
    const { deps, events } = make(a);
    await runAiWith(deps, "food_scan", req);
    expect(events[0]).toMatchObject({
      provider: "google",
      status: "fallback",
      errorCode: "free_tier",
    });
  });

  it("does not retry a dead key on the same provider (goes straight to the fallback)", async () => {
    const a = {
      anthropic: ok("anthropic"),
      google: failing("google", { status: 401 }),
    };
    const { deps } = make(a);
    expect((await runAiWith(deps, "food_scan", req)).provider).toBe(
      "anthropic",
    );
    expect(a.google.call).toHaveBeenCalledTimes(1);
  });

  it("does not fall back on our own bad request, and throws a typed error", async () => {
    const a = {
      anthropic: ok("anthropic"),
      google: failing("google", { status: 400, message: "bad model" }),
    };
    const { deps, events } = make(a);
    await expect(runAiWith(deps, "food_scan", req)).rejects.toMatchObject({
      name: "AiError",
      code: "provider_failed",
    });
    expect(a.anthropic.call).not.toHaveBeenCalled();
    expect(events).toEqual([
      expect.objectContaining({ status: "error", errorCode: "400" }),
    ]);
  });

  it("tries the fallback when the primary returns unusable output", async () => {
    const a = {
      anthropic: ok("anthropic"),
      google: failing("google", new AiError("bad_output")),
    };
    const { deps } = make(a);
    expect((await runAiWith(deps, "food_scan", req)).provider).toBe(
      "anthropic",
    );
  });

  it("gives up after one fallback and logs both failures", async () => {
    const a = {
      anthropic: failing("anthropic", { status: 500 }),
      google: failing("google", { status: 503 }),
    };
    const { deps, events } = make(a);
    await expect(runAiWith(deps, "food_scan", req)).rejects.toBeInstanceOf(
      AiError,
    );
    expect(events.map((e) => e.status)).toEqual(["fallback", "error"]);
    // google answered 503: one same-provider retry, then the fallback (which got a 500: no retry)
    expect(a.google.call).toHaveBeenCalledTimes(2);
    expect(a.anthropic.call).toHaveBeenCalledTimes(1);
  });

  it("uses the other provider and logs the config problem when the primary's key is missing", async () => {
    const a = { anthropic: ok("anthropic"), google: ok("google") };
    const { deps, events } = make(a, ["anthropic"]);
    expect((await runAiWith(deps, "food_scan", req)).provider).toBe(
      "anthropic",
    );
    expect(events).toEqual([
      expect.objectContaining({
        provider: "google",
        task: "config",
        errorCode: "missing_api_key",
      }),
    ]);
  });

  it("fails closed with not_configured when no provider has a key", async () => {
    const a = { anthropic: ok("anthropic"), google: ok("google") };
    const { deps, events } = make(a, []);
    await expect(runAiWith(deps, "chat", req)).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(events[0]).toMatchObject({ errorCode: "no_api_key" });
    expect(a.anthropic.call).not.toHaveBeenCalled();
  });
});
