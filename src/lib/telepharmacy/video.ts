import "server-only";
import {
  createHash,
  createSign,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { getVideoEnv } from "@/lib/env";
import type { VideoProvider } from "./telepharmacy";

/**
 * Video rooms, behind one adapter so the provider can change without touching the
 * rest (docs/KNOWLEDGE_telepharmacy.md §8). Rules that hold for every provider:
 *   · the room name comes from crypto.randomBytes — it cannot be guessed;
 *   · a link is built when somebody who IS one of the two parties asks for it, and is
 *     never stored, logged or sent anywhere else (not in a notification, not in a page
 *     that anyone else can open);
 *   · the customer's access key is random too, and only its SHA-256 is kept.
 * The public Jitsi server has no SLA, no access control and no recording rules —
 * fine for trying the flow, not a decision for real patients (docs/TELEPHARMACY-EKYC-DESIGN.md).
 */
export type Role = "pharmacist" | "patient";

export interface Room {
  provider: VideoProvider;
  room: string;
}

/** A room name nobody can guess: 96 random bits behind a fixed prefix. */
export function makeRoom(provider: VideoProvider, seed = "RooSuk"): Room {
  const safeSeed = seed.replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "RooSuk";
  return { provider, room: `${safeSeed}-${randomBytes(12).toString("hex")}` };
}

/** Is the chosen provider usable with what the server has? ("jitsi" always is.) */
export function videoConfigured(provider: VideoProvider): boolean {
  const env = getVideoEnv();
  if (provider === "jaas") return env.jaas !== null;
  if (provider === "custom") return env.customBaseUrl !== null;
  return true;
}

// ── the customer's access key ───────────────────────────────────────────────
export function newAccessKey(): string {
  return randomBytes(16).toString("hex");
}
export function hashAccessKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
/** Constant-time check of a presented key against the stored hash. */
export function accessKeyMatches(
  key: unknown,
  storedHash: string | null | undefined,
): boolean {
  if (typeof key !== "string" || !/^[0-9a-f]{32}$/.test(key) || !storedHash)
    return false;
  const a = Buffer.from(hashAccessKey(key), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── JaaS (8x8 Jitsi as a Service) ───────────────────────────────────────────
const b64u = (v: Buffer | string) =>
  Buffer.from(v).toString("base64url");

/** An RS256 JWT for JaaS: only the pharmacist is a moderator; no recording or streaming. */
export function signJaasJwt(args: {
  appId: string;
  keyId: string;
  privateKey: string;
  room: string;
  name: string;
  role: Role;
  now?: Date;
  ttlMinutes?: number;
}): string {
  const nowS = Math.floor((args.now ?? new Date()).getTime() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: `${args.appId}/${args.keyId}` };
  const payload = {
    aud: "jitsi",
    iss: "chat",
    sub: args.appId,
    room: args.room,
    nbf: nowS - 10,
    exp: nowS + (args.ttlMinutes ?? 120) * 60,
    context: {
      user: {
        name: args.name.slice(0, 60),
        moderator: args.role === "pharmacist",
      },
      features: {
        recording: false,
        livestreaming: false,
        transcription: false,
        "outbound-call": false,
        "sip-outbound-call": false,
      },
    },
  };
  const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  const sig = createSign("RSA-SHA256").update(input).sign(args.privateKey);
  return `${input}.${b64u(sig)}`;
}

/**
 * The link one party opens. Returns null when the provider is not configured —
 * the caller says "video not available", it does not fall back to another provider
 * behind the admin's back.
 */
export function joinUrl(args: {
  provider: VideoProvider;
  room: string;
  role: Role;
  name: string;
  now?: Date;
}): string | null {
  if (!/^[A-Za-z0-9-]{8,80}$/.test(args.room)) return null;
  const env = getVideoEnv();
  const hashName = `userInfo.displayName=${encodeURIComponent(JSON.stringify(args.name.slice(0, 60)))}`;
  if (args.provider === "jaas") {
    if (!env.jaas) return null;
    const jwt = signJaasJwt({ ...env.jaas, ...args });
    return `https://8x8.vc/${env.jaas.appId}/${args.room}?jwt=${jwt}`;
  }
  if (args.provider === "custom") {
    if (!env.customBaseUrl) return null;
    return `${env.customBaseUrl}/${args.room}#${hashName}`;
  }
  return `${env.jitsiBaseUrl}/${args.room}#${hashName}`;
}
