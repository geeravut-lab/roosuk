import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The share-card routes read the bundled Thai font at runtime; make sure the
  // deployed function carries it (file tracing cannot see a computed path).
  outputFileTracingIncludes: {
    "/api/share/**": ["./src/assets/fonts/**", "./public/brand/logo-mark.png"],
  },
  experimental: {
    // Photo scans post an image through a Server Action. The browser shrinks it
    // to about 1 MB first; the server re-checks its own 3 MB limit, and this
    // only has to be a little above that (Netlify's own cap is 6 MB).
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
