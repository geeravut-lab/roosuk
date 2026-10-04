import { z } from "zod";

/**
 * Voice typing: the browser records, turns the sound into a plain 16 kHz mono
 * 16-bit WAV (the one format every provider takes, whatever the phone records
 * in), the server checks it, a speech model turns it into text, and the text
 * lands in a box for the person to check. Nothing is run by voice.
 */
export const VOICE_RATE = 16_000;
export const MAX_SECONDS = 40;
export const MIN_SECONDS = 0.4;
/** 40 s of 16 kHz mono 16-bit is 1.28 MB; a little headroom for the header. */
export const MAX_BYTES = 1_400_000;
export const MAX_TRANSCRIPT_CHARS = 800;

/** Float samples (−1…1) → a PCM16 WAV file. Clipped, never wrapped. */
export function encodeWav(
  samples: Float32Array,
  sampleRate = VOICE_RATE,
): Uint8Array {
  const data = samples.length * 2;
  const buf = new ArrayBuffer(44 + data);
  const v = new DataView(buf);
  const text = (o: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, "RIFF");
  v.setUint32(4, 36 + data, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, data, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

export type WavCheck =
  | { ok: true; seconds: number; sampleRate: number }
  | { ok: false; reason: "audio" | "long" | "short" };

/** The server's check of an uploaded recording, from the real bytes (never the file name or declared type). */
export function checkWav(bytes: Uint8Array): WavCheck {
  if (bytes.length < 44 || bytes.length > MAX_BYTES + 4096)
    return { ok: false, reason: bytes.length < 44 ? "audio" : "long" };
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) =>
    String.fromCharCode(
      v.getUint8(o),
      v.getUint8(o + 1),
      v.getUint8(o + 2),
      v.getUint8(o + 3),
    );
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE" || tag(12) !== "fmt ")
    return { ok: false, reason: "audio" };
  const fmt = v.getUint16(20, true);
  const channels = v.getUint16(22, true);
  const rate = v.getUint32(24, true);
  const bits = v.getUint16(34, true);
  if (
    fmt !== 1 ||
    bits !== 16 ||
    channels < 1 ||
    channels > 2 ||
    rate < 8000 ||
    rate > 48_000
  )
    return { ok: false, reason: "audio" };
  // find the data chunk (a header can carry extra chunks)
  let o = 12;
  while (o + 8 <= bytes.length) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    if (id === "data") {
      const avail = Math.min(size, bytes.length - (o + 8));
      const seconds = avail / (rate * channels * 2);
      if (seconds > MAX_SECONDS) return { ok: false, reason: "long" };
      if (seconds < MIN_SECONDS) return { ok: false, reason: "short" };
      return { ok: true, seconds, sampleRate: rate };
    }
    o += 8 + size + (size % 2);
  }
  return { ok: false, reason: "audio" };
}

export const TRANSCRIBE_SCHEMA = {
  type: "object",
  properties: { text: { type: "string" } },
  required: ["text"],
} as const;

export const TRANSCRIBE_SYSTEM = [
  "You are a speech-to-text engine for a Thai wellness app.",
  "Transcribe exactly what is spoken, in the language spoken (Thai, English, or a mix). Do not translate, summarise, answer, or add anything.",
  "Use natural Thai spelling without spaces between words except where a pause is clear. Keep numbers as spoken.",
  'If there is no intelligible speech, return {"text": ""}.',
  'Return JSON: {"text": string}.',
].join("\n");

export const TRANSCRIBE_PROMPT = "Transcribe this recording.";

/** The model's text → what goes in the box: tidy whitespace, at most 800 characters; null when empty. */
export function normalizeTranscript(raw: unknown): string | null {
  const r = z.object({ text: z.string() }).safeParse(raw);
  if (!r.success) return null;
  const t = r.data.text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TRANSCRIPT_CHARS);
  return t.length > 0 ? t : null;
}
