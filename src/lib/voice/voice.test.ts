import { describe, expect, it } from "vitest";
import {
  MAX_SECONDS,
  VOICE_RATE,
  checkWav,
  encodeWav,
  normalizeTranscript,
} from "./voice";

const tone = (seconds: number, rate = VOICE_RATE) =>
  Float32Array.from(
    { length: Math.round(seconds * rate) },
    (_, i) => Math.sin(i / 20) * 0.5,
  );

describe("encodeWav / checkWav", () => {
  it("round-trips: a valid file reports its length and rate", () => {
    const c = checkWav(encodeWav(tone(2)));
    expect(c).toMatchObject({ ok: true, sampleRate: VOICE_RATE });
    if (c.ok) expect(c.seconds).toBeCloseTo(2, 2);
  });
  it("clips instead of wrapping", () => {
    const wav = encodeWav(Float32Array.from([2, -2, 0.5]), 16000);
    const v = new DataView(wav.buffer);
    expect(v.getInt16(44, true)).toBe(32767);
    expect(v.getInt16(46, true)).toBe(-32768);
  });
  it("refuses too short and too long recordings", () => {
    expect(checkWav(encodeWav(tone(0.1)))).toEqual({
      ok: false,
      reason: "short",
    });
    expect(checkWav(encodeWav(tone(MAX_SECONDS + 3)))).toEqual({
      ok: false,
      reason: "long",
    });
    expect(checkWav(encodeWav(tone(MAX_SECONDS - 1))).ok).toBe(true);
  });
  it("refuses anything that is not a PCM16 WAV, whatever it claims to be", () => {
    expect(checkWav(new Uint8Array())).toEqual({ ok: false, reason: "audio" });
    expect(
      checkWav(new TextEncoder().encode("<?php echo 1; ?>".repeat(10))),
    ).toEqual({ ok: false, reason: "audio" });
    expect(
      checkWav(
        Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, ...new Array(80).fill(0)]),
      ),
    ).toEqual({ ok: false, reason: "audio" }); // webm
    const wav = encodeWav(tone(1));
    const float = wav.slice();
    new DataView(float.buffer).setUint16(20, 3, true); // IEEE float
    expect(checkWav(float)).toEqual({ ok: false, reason: "audio" });
    const bits = wav.slice();
    new DataView(bits.buffer).setUint16(34, 8, true);
    expect(checkWav(bits)).toEqual({ ok: false, reason: "audio" });
    const rate = wav.slice();
    new DataView(rate.buffer).setUint32(24, 1000, true);
    expect(checkWav(rate)).toEqual({ ok: false, reason: "audio" });
  });
  it("a data size that lies cannot make it look longer or shorter than the bytes it has", () => {
    const wav = encodeWav(tone(1));
    const lie = wav.slice();
    new DataView(lie.buffer).setUint32(40, 0x7fffffff, true);
    const c = checkWav(lie);
    expect(c.ok).toBe(true);
    if (c.ok) expect(c.seconds).toBeCloseTo(1, 2);
  });
  it("finds the data chunk after an extra chunk", () => {
    const wav = encodeWav(tone(1));
    const extra = new Uint8Array(wav.length + 12);
    extra.set(wav.slice(0, 36), 0);
    extra.set(new TextEncoder().encode("LIST"), 36);
    new DataView(extra.buffer).setUint32(40, 4, true);
    extra.set(wav.slice(36), 48);
    expect(checkWav(extra).ok).toBe(true);
  });
});

describe("normalizeTranscript", () => {
  it("tidies whitespace and caps the length", () => {
    expect(normalizeTranscript({ text: "  นอนไม่หลับ \n มาสามคืน  " })).toBe(
      "นอนไม่หลับ มาสามคืน",
    );
    expect(normalizeTranscript({ text: "x".repeat(2000) })).toHaveLength(800);
  });
  it("is null for silence, junk shapes and non-objects", () => {
    expect(normalizeTranscript({ text: "   " })).toBeNull();
    expect(normalizeTranscript({ text: 5 })).toBeNull();
    expect(normalizeTranscript(null)).toBeNull();
    expect(normalizeTranscript("hello")).toBeNull();
  });
});
