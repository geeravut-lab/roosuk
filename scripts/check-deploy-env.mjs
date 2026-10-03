// Runs before `next build` on Netlify (see netlify.toml). Fails a PRODUCTION
// build early, naming what is missing, instead of publishing a site whose
// sign-in cannot work. Prints variable NAMES only, never values.
import {
  isNetlifyProductionBuild,
  missingEnv,
  RECOMMENDED_PRODUCTION_ENV,
  REQUIRED_PRODUCTION_ENV,
} from "./lib/deploy-env.mjs";

if (!isNetlifyProductionBuild(process.env)) process.exit(0);

const missing = missingEnv(process.env, REQUIRED_PRODUCTION_ENV);
if (missing.length) {
  console.error(
    [
      "",
      "✖ Production build stopped: required environment variables are not set on Netlify:",
      ...missing.map((n) => `    - ${n}`),
      "",
      "  Netlify → Site configuration → Environment variables (see docs/SETUP-GUIDE.md §B5),",
      "  then trigger a new deploy. The previous deploy stays live.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const advisory = missingEnv(process.env, RECOMMENDED_PRODUCTION_ENV);
if (advisory.length)
  console.warn(`! Not set (optional for now): ${advisory.join(", ")}`);
console.log("✓ Required production environment variables are present.");
