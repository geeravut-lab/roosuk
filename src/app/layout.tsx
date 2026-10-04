import type { Metadata, Viewport } from "next";
import { Geist, Noto_Sans_Thai } from "next/font/google";
import { dict } from "@/lib/i18n/dict";
import { I18nProvider } from "@/lib/i18n/provider";
import { getLang } from "@/lib/i18n/server";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme, themeAttribute } from "@/lib/theme";
import { NavigationFeedback } from "@/components/NavigationFeedback";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-sans-thai",
  subsets: ["thai"],
});

export const metadata: Metadata = {
  title: { default: "รู้สุข | RooSuk", template: "%s | รู้สุข" },
  description: "AI ที่รู้จักสุขภาพของคุณ — AI Personal Health OS",
  applicationName: "RooSuk",
};

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
        <I18nProvider lang={lang} dict={dict[lang]}>
          <NavigationFeedback />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
