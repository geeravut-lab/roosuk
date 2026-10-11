import type { MetadataRoute } from "next";
import { loadBrand } from "@/lib/brand/server";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await loadBrand();
  const custom = brand.favicon
    ? `/brand/favicon?v=${brand.favicon.version}`
    : null;
  return {
    name: `${brand.nameTh} ${brand.nameEn}`,
    short_name: brand.nameTh,
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
    // The admin's tab icon is a square PNG (192–1024 px), so it serves as both install sizes.
    icons: custom
      ? [
          { src: custom, sizes: "192x192", type: "image/png" },
          { src: custom, sizes: "512x512", type: "image/png" },
        ]
      : [
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
