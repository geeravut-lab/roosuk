import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "รู้สุข RooSuk",
    short_name: "รู้สุข",
    description: "AI ที่รู้จักสุขภาพของคุณ",
    lang: "th",
    start_url: "/today",
    display: "standalone",
    background_color: "#F7FBFA",
    theme_color: "#0A8FA3",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
