import type { Metadata, Viewport } from "next";
import { Geist, Noto_Sans_Thai } from "next/font/google";
import { I18nProvider } from "@/lib/i18n/provider";
import { loadBrand } from "@/lib/brand/server";
import { brandedDict, getLang } from "@/lib/i18n/server";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme, themeAttribute } from "@/lib/theme";
import { NavigationFeedback } from "@/components/NavigationFeedback";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-sans-thai",
  subsets: ["thai"],
});

export async function generateMetadata(): Promise<Metadata> {
  const brand = await loadBrand();
  const icon = brand.favicon
    ? `/brand/favicon?v=${brand.favicon.version}`
    : "/brand/favicon";
  return {
    title: {
      default: `${brand.nameTh} | ${brand.nameEn}`,
      template: `%s | ${brand.nameTh}`,
    },
    description: "AI ที่รู้จักสุขภาพของคุณ — AI Personal Health OS",
    applicationName: brand.nameEn,
    // iOS: opened from the home screen it runs full-screen like an app, with its own name under the icon.
    appleWebApp: {
      capable: true,
      title: brand.nameTh,
      statusBarStyle: "default",
    },
    formatDetection: { telephone: false },
    // The tab icon is the admin's when set (a version in the URL makes browsers fetch the new one).
    icons: {
      icon: [{ url: icon, type: "image/png" }],
      apple: [{ url: `${icon}${icon.includes("?") ? "&" : "?"}apple=1` }],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0A8FA3" },
    { media: "(prefers-color-scheme: dark)", color: "#0E191C" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const lang = await getLang();
  const t = await brandedDict(lang);
  const theme = themeAttribute(
    parseTheme((await cookies()).get(THEME_COOKIE)?.value),
  );
  return (
    <html
      lang={lang}
      data-theme={theme}
      className={`${geistSans.variable} ${notoSansThai.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <I18nProvider lang={lang} dict={t}>
          <NavigationFeedback />
          <PwaRegister />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
