import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./src/test/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    // Every database test boots an in-memory Postgres and applies ALL migrations; with the suite
    // running in parallel on a small machine that can take longer than the 10 s default.
    hookTimeout: 60_000,
    testTimeout: 30_000,
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "scripts/**/*.test.mjs",
      "supabase/tests/**/*.test.ts",
    ],
  },
});
