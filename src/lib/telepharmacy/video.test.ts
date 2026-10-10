import {
  createPublicKey,
  createVerify,
  generateKeyPairSync,
} from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accessKeyMatches,
  hashAccessKey,
  joinUrl,
  makeRoom,
  newAccessKey,
  signJaasJwt,
  videoConfigured,
} from "./video";

afterEach(() => vi.unstubAllEnvs());

describe("rooms", () => {
  it("get an unguessable name, different every time", () => {
    const a = makeRoom("jitsi");
    const b = makeRoom("jitsi");
    expect(a.room).toMatch(/^RooSuk-[0-9a-f]{24}$/);
    expect(a.room).not.toBe(b.room);
    expect(makeRoom("jitsi", "x y!z").room).toMatch(/^xyz-[0-9a-f]{24}$/);
  });
});

describe("the customer's access key", () => {
  it("is random, 128 bits, and only its SHA-256 is kept", () => {
    const k = newAccessKey();
    expect(k).toMatch(/^[0-9a-f]{32}$/);
    expect(newAccessKey()).not.toBe(k);
    const h = hashAccessKey(k);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(k);
  });
  it("matches only the right key; garbage, empty and a missing hash never match", () => {
    const k = newAccessKey();
    const h = hashAccessKey(k);
    expect(accessKeyMatches(k, h)).toBe(true);
    expect(accessKeyMatches(newAccessKey(), h)).toBe(false);
    expect(accessKeyMatches(k.toUpperCase(), h)).toBe(false);
    expect(accessKeyMatches("", h)).toBe(false);
    expect(accessKeyMatches(undefined, h)).toBe(false);
    expect(accessKeyMatches(k, null)).toBe(false);
    expect(accessKeyMatches(k, "zz")).toBe(false);
  });
});

describe("joinUrl", () => {
  const room = "RooSuk-0123456789abcdef01234567";
  it("jitsi is the default and carries the display name, not health data", () => {
    const u = joinUrl({
      provider: "jitsi",
      room,
      role: "patient",
      name: "สมชาย",
    });
    expect(u).toContain(`https://meet.jit.si/${room}#userInfo.displayName=`);
    expect(decodeURIComponent(u as string)).toContain('"สมชาย"');
  });
  it("refuses a room name that is not one of ours", () => {
    expect(
      joinUrl({
        provider: "jitsi",
        room: "../../x",
        role: "patient",
        name: "a",
      }),
    ).toBeNull();
    expect(
      joinUrl({ provider: "jitsi", room: "a b", role: "patient", name: "a" }),
    ).toBeNull();
  });
  it("jaas and custom are null until configured — never a quiet fallback", () => {
    expect(videoConfigured("jaas")).toBe(false);
    expect(videoConfigured("custom")).toBe(false);
    expect(videoConfigured("jitsi")).toBe(true);
    expect(
      joinUrl({ provider: "jaas", room, role: "patient", name: "a" }),
    ).toBeNull();
    expect(
      joinUrl({ provider: "custom", room, role: "patient", name: "a" }),
    ).toBeNull();
    vi.stubEnv("VIDEO_BASE_URL", "https://video.example.com/");
    expect(videoConfigured("custom")).toBe(true);
    expect(
      joinUrl({ provider: "custom", room, role: "pharmacist", name: "a" }),
    ).toContain(`https://video.example.com/${room}#`);
  });
  it("only an https custom URL is accepted", () => {
    vi.stubEnv("VIDEO_BASE_URL", "http://insecure.example.com");
    expect(videoConfigured("custom")).toBe(false);
  });
});

describe("JaaS JWT", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const now = new Date("2026-11-18T03:00:00Z");
  const sign = (role: "pharmacist" | "patient") =>
    signJaasJwt({
      appId: "vpaas-magic-cookie-abc",
      keyId: "k1",
      privateKey,
      room: "R-1",
      name: "ภก. หนึ่ง",
      role,
      now,
    });

  it("is a valid RS256 token: right header, audience, room, expiry; verifiable with the public key", () => {
    const jwt = sign("pharmacist");
    const [h, p, s] = jwt.split(".");
    const header = JSON.parse(Buffer.from(h, "base64url").toString());
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(header).toEqual({
      alg: "RS256",
      typ: "JWT",
      kid: "vpaas-magic-cookie-abc/k1",
    });
    expect(payload).toMatchObject({
      aud: "jitsi",
      iss: "chat",
      sub: "vpaas-magic-cookie-abc",
      room: "R-1",
    });
    expect(payload.exp - payload.nbf).toBe(120 * 60 + 10);
    expect(
      createVerify("RSA-SHA256")
        .update(`${h}.${p}`)
        .verify(createPublicKey(publicKey), Buffer.from(s, "base64url")),
    ).toBe(true);
    // tampering breaks it
    expect(
      createVerify("RSA-SHA256")
        .update(`${h}.${p}x`)
        .verify(createPublicKey(publicKey), Buffer.from(s, "base64url")),
    ).toBe(false);
  });
  it("only the pharmacist moderates; nothing is recorded or streamed", () => {
    const claims = (role: "pharmacist" | "patient") =>
      JSON.parse(Buffer.from(sign(role).split(".")[1], "base64url").toString())
        .context;
    expect(claims("pharmacist").user.moderator).toBe(true);
    expect(claims("patient").user.moderator).toBe(false);
    expect(claims("patient").features).toMatchObject({
      recording: false,
      livestreaming: false,
    });
  });
  it("joinUrl builds the JaaS link with a token when the three variables are set", () => {
    vi.stubEnv("JAAS_APP_ID", "vpaas-magic-cookie-abc");
    vi.stubEnv("JAAS_KEY_ID", "k1");
    vi.stubEnv("JAAS_PRIVATE_KEY", privateKey.replace(/\n/g, "\\n"));
    expect(videoConfigured("jaas")).toBe(true);
    const u = joinUrl({
      provider: "jaas",
      room: "RooSuk-0123456789abcdef01234567",
      role: "patient",
      name: "a",
      now,
    })!;
    expect(u).toMatch(
      /^https:\/\/8x8\.vc\/vpaas-magic-cookie-abc\/RooSuk-0123456789abcdef01234567\?jwt=[\w-]+\.[\w-]+\.[\w-]+$/,
    );
  });
});
