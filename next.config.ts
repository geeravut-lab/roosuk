import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Photo scans post an image through a Server Action. The browser shrinks it
    // to about 1 MB first; the server re-checks its own 3 MB limit, and this
    // only has to be a little above that (Netlify's own cap is 6 MB).
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
