import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "รู้สุข RooSuk",
    short_name: "รู้สุข",
    description: "AI ที่รู้จักสุขภาพของคุณ",
    lang: "th",
    id: "/today",
    start_url: "/today",
    scope: "/",
    orientation: "portrait",
    categories: ["health", "lifestyle"],
    display: "standalone",
    background_color: "#F7FBFA",
    theme_color: "#0A8FA3",
    shortcuts: [
      {
        name: "เช็กอินวันนี้",
        url: "/today/checkin",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        ],
      },
      {
        name: "สแกนสุขภาพ",
        url: "/scan",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        ],
      },
    ],
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
