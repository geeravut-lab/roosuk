import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnthropicAdapter } from "./adapters/anthropic";
import { createGoogleAdapter } from "./adapters/google";

// Netlify's AI Gateway injects these into functions; the SDKs read them silently.
// Our adapters must still talk to the providers directly (see GOOGLE_BASE_URL).
describe("provider base URLs are pinned", () => {
  afterEach(() => vi.unstubAllEnvs());

  async function hostOf(call: () => Promise<unknown>): Promise<string> {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (input: unknown) => {
      seen.push(String((input as { url?: string })?.url ?? input));
      throw new Error("stop");
    });
    await call().catch(() => undefined);
    vi.unstubAllGlobals();
    return new URL(seen[0] ?? "http://none.invalid").host;
  }

  it("Gemini ignores GOOGLE_GEMINI_BASE_URL", async () => {
    vi.stubEnv("GOOGLE_GEMINI_BASE_URL", "https://gateway.example.test");
    const host = await hostOf(() =>
      createGoogleAdapter().call({ prompt: "x" }, "gemini-flash-latest", "k"),
    );
    expect(host).toBe("generativelanguage.googleapis.com");
  });

  it("Claude ignores ANTHROPIC_BASE_URL", async () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://gateway.example.test");
    const host = await hostOf(() =>
      createAnthropicAdapter().call({ prompt: "x" }, "claude-haiku-4-5", "k"),
    );
    expect(host).toBe("api.anthropic.com");
  });
});
