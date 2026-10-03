import { describe, expect, it } from "vitest";
import {
  isNetlifyProductionBuild,
  missingEnv,
  REQUIRED_PRODUCTION_ENV,
} from "./deploy-env.mjs";

describe("deploy env check", () => {
  it("reports unset and blank variables by name", () => {
    expect(
      missingEnv({ A: "x", B: "", C: "  " }, ["A", "B", "C", "D"]),
    ).toEqual(["B", "C", "D"]);
  });

  it("requires the Supabase variables that are baked in at build time", () => {
    expect(REQUIRED_PRODUCTION_ENV).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(REQUIRED_PRODUCTION_ENV).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(REQUIRED_PRODUCTION_ENV).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("applies only to the real production build on Netlify", () => {
    expect(
      isNetlifyProductionBuild({ NETLIFY: "true", CONTEXT: "production" }),
    ).toBe(true);
    expect(
      isNetlifyProductionBuild({ NETLIFY: "true", CONTEXT: "deploy-preview" }),
    ).toBe(false);
    expect(isNetlifyProductionBuild({ CONTEXT: "production" })).toBe(false);
    expect(isNetlifyProductionBuild({})).toBe(false);
  });
});
