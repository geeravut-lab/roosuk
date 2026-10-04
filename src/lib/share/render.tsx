import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";
import { fmt, type Dict } from "@/lib/i18n/dict";
import type { FoodCardData, LabCardData, QuizCardData } from "./share";

/**
 * Draws the share cards (1080×1080, square so LINE and social feeds crop
 * nothing). Satori understands only a small CSS subset: flex layouts and inline
 * styles. The Thai font is bundled (src/assets/fonts, SIL OFL) and read once.
 */
const SIZE = 1080;
const TEAL = "#0A8FA3";
const TEAL_TEXT = "#07707F";
const INK = "#1F2A30";
const MUTED = "#5B6B73";

const mark = readFile(join(process.cwd(), "public/brand/logo-mark.png")).then(
  (b) => `data:image/png;base64,${b.toString("base64")}`,
);

const fonts = Promise.all([
  readFile(join(process.cwd(), "src/assets/fonts/NotoSansThai-Regular.ttf")),
  readFile(join(process.cwd(), "src/assets/fonts/NotoSansThai-Bold.ttf")),
]).then(([regular, bold]) => [
  {
    name: "Noto Sans Thai",
    data: regular,
    weight: 400 as const,
    style: "normal" as const,
  },
  {
    name: "Noto Sans Thai",
    data: bold,
    weight: 700 as const,
    style: "normal" as const,
  },
]);

// Set once per request before drawing (the same value every time).
let markSrc = "";

function Frame({
  t,
  host,
  children,
}: {
  t: Dict;
  host: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        width: SIZE,
        height: SIZE,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        background: "linear-gradient(160deg, #F7FBFA 0%, #D9F3EC 100%)",
        fontFamily: "Noto Sans Thai",
        color: INK,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={markSrc} width={96} height={96} alt="" />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 56,
              fontWeight: 700,
              color: TEAL_TEXT,
            }}
          >
            {t.appName}
          </div>
          <div style={{ display: "flex", fontSize: 28, color: MUTED }}>
            {t.cardTagline}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: "#FFFFFF",
          borderRadius: 56,
          padding: 64,
          gap: 28,
          boxShadow: "0 8px 40px rgba(10,143,163,0.15)",
        }}
      >
        {children}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", fontSize: 26, color: MUTED }}>
          {t.cardDisclaimer}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 32,
            fontWeight: 700,
            color: TEAL_TEXT,
          }}
        >
          {fmt(t.cardCta, { host })}
        </div>
      </div>
    </div>
  );
}

const Title = ({ children }: { children: ReactNode }) => (
  <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: MUTED }}>
    {children}
  </div>
);

export function quizCard(t: Dict, host: string, d: QuizCardData): ReactNode {
  const delta = d.healthAge - d.realAge;
  const deltaText =
    delta < 0
      ? fmt(t.cardDeltaYounger, { n: -delta })
      : delta > 0
        ? fmt(t.cardDeltaOlder, { n: delta })
        : t.cardDeltaSame;
  return (
    <Frame t={t} host={host}>
      <Title>{t.cardQuizTitle}</Title>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
        <div
          style={{
            display: "flex",
            fontSize: 220,
            fontWeight: 700,
            color: TEAL,
            lineHeight: 1,
          }}
        >
          {d.score}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 48,
            color: MUTED,
            paddingBottom: 28,
          }}
        >
          {t.scoreOutOf}
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 36, color: MUTED }}>
        {t.quizHealthAge}
      </div>
      <div style={{ display: "flex", fontSize: 48, fontWeight: 700 }}>
        {fmt(t.quizHealthAgeLine, { health: d.healthAge, real: d.realAge })}
      </div>
      <div style={{ display: "flex", fontSize: 40, color: TEAL_TEXT }}>
        {deltaText}
      </div>
    </Frame>
  );
}

function Stat({
  n,
  label,
  color,
}: {
  n: number;
  label: string;
  color: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
      <div
        style={{
          display: "flex",
          fontSize: 120,
          fontWeight: 700,
          color,
          lineHeight: 1,
        }}
      >
        {n}
      </div>
      <div style={{ display: "flex", fontSize: 44 }}>{label}</div>
    </div>
  );
}

export function labCard(t: Dict, host: string, d: LabCardData): ReactNode {
  return (
    <Frame t={t} host={host}>
      <Title>{t.cardLabTitle}</Title>
      <div style={{ display: "flex", fontSize: 44 }}>
        {fmt(t.cardLabAssessed, { n: d.assessed })}
      </div>
      <Stat n={d.normal} label={t.cardLabNormal} color={TEAL} />
      {d.outside > 0 ? (
        <Stat n={d.outside} label={t.cardLabWatch} color="#B7791F" />
      ) : null}
    </Frame>
  );
}

export function foodCard(t: Dict, host: string, d: FoodCardData): ReactNode {
  return (
    <Frame t={t} host={host}>
      <Title>{t.cardFoodTitle}</Title>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {d.names.map((n, i) => (
          <div
            key={i}
            style={{ display: "flex", fontSize: 52, fontWeight: 700 }}
          >
            {n}
          </div>
        ))}
        {d.more > 0 ? (
          <div style={{ display: "flex", fontSize: 36, color: MUTED }}>
            {fmt(t.cardFoodMore, { n: d.more })}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
        <div
          style={{
            display: "flex",
            fontSize: 120,
            fontWeight: 700,
            color: TEAL,
            lineHeight: 1,
          }}
        >
          {d.kcal}
        </div>
        <div style={{ display: "flex", fontSize: 44 }}>
          {t.cardFoodKcalUnit}
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 30, color: MUTED }}>
        {t.cardFoodEstimate}
      </div>
    </Frame>
  );
}

/** A finished PNG response; never cached by shared caches (the card may describe one person). */
export async function cardResponse(
  node: ReactNode,
  cache: "public" | "private",
): Promise<Response> {
  markSrc = await mark;
  const res = new ImageResponse(node as React.ReactElement, {
    width: SIZE,
    height: SIZE,
    fonts: await fonts,
  });
  res.headers.set(
    "Cache-Control",
    cache === "public" ? "public, max-age=3600" : "private, no-store",
  );
  res.headers.set("X-Content-Type-Options", "nosniff");
  return res;
}
