import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// The sandbox ships its own Chromium; Playwright's default lookup does not find it.
const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  (existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined);

const PORT = 3100;
// A short Thai sentence spoken by a speech synthesiser; the fake microphone plays it in a loop.
const FAKE_AUDIO = `${process.cwd()}/e2e/fixtures/voice-th.wav`;

// Node's built-in fetch ignores HTTPS_PROXY unless asked; the sandbox needs it to reach Supabase.
// (Harmless elsewhere. Workers and the web server inherit it.)
process.env.NODE_USE_ENV_PROXY ??= "1";

// A fixed key for the live suite only: the server under test and the specs that seed sealed
// files must agree on it. Test data, deleted by the specs — never a real key.
if (process.env.E2E_LIVE === "1")
  process.env.FILE_ENCRYPTION_KEY ||= "e2e".padEnd(64, "0");

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  // The live specs share one Supabase project (platform_settings, ai_settings…), so they must not run side by side.
  workers: process.env.E2E_LIVE === "1" ? 1 : undefined,
  reporter: [["list"]],
  // Run `npm run build` first. ENABLE_UI_PREVIEW exposes /preview/* (the real
  // AppShell without a backend); it must never be set on Netlify.
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    env: { ENABLE_UI_PREVIEW: "1", NODE_USE_ENV_PROXY: "1" },
    reuseExistingServer: false,
    timeout: 60_000,
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: {
      executablePath,
      // A fake camera and microphone that never ask for permission (the barcode and voice specs open them).
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        ...(existsSync(FAKE_AUDIO)
          ? [`--use-file-for-fake-audio-capture=${FAKE_AUDIO}`]
          : []),
      ],
    },
  },
  projects: [
    {
      name: "mobile",
      // 390×844 @3x: the size where most responsive bugs actually show up.
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
      },
    },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
});
