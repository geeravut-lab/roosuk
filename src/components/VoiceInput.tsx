"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { transcribeVoiceAction } from "@/app/actions/voice";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { VOICE_RATE, encodeWav } from "@/lib/voice/voice";
import { Spinner } from "./Spinner";

const LIMIT_MS = 30_000;

/** Whatever the phone recorded (webm, mp4, ogg…) → 16 kHz mono samples, by the browser's own decoder. */
async function toSamples(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    const offline = new OfflineAudioContext(
      1,
      Math.max(1, Math.ceil(audio.duration * VOICE_RATE)),
      VOICE_RATE,
    );
    const src = offline.createBufferSource();
    src.buffer = audio;
    src.connect(offline.destination);
    src.start();
    return (await offline.startRendering()).getChannelData(0);
  } finally {
    void ctx.close();
  }
}

/**
 * A microphone button: record, stop, and the words come back as text for the
 * caller to put in a box. The recording is sent once and not kept; the person
 * always checks the text before anything is done with it.
 */
export function VoiceInput({ onText }: { onText: (text: string) => void }) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(
    null,
  );
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supported =
    typeof window !== "undefined" &&
    "MediaRecorder" in window &&
    !!navigator.mediaDevices?.getUserMedia;

  const release = () => {
    if (timer.current) clearTimeout(timer.current);
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
  };
  useEffect(() => release, []);

  async function start() {
    setMessage(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
    } catch {
      setMessage({ text: t.voiceDenied, ok: false });
      return;
    }
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream.current);
    rec.current = r;
    r.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    r.onstop = async () => {
      release();
      setState("working");
      try {
        const samples = await toSamples(new Blob(chunks, { type: r.mimeType }));
        const wav = encodeWav(samples);
        const form = new FormData();
        form.set(
          "audio",
          new File([wav.buffer as ArrayBuffer], "voice.wav", {
            type: "audio/wav",
          }),
        );
        const res = await transcribeVoiceAction(form);
        if ("text" in res) {
          onText(res.text);
          setMessage({ text: t.voiceDone, ok: true });
        } else setMessage({ text: errorText(res.error, t), ok: false });
      } catch {
        setMessage({ text: t.err_voice_audio, ok: false });
      }
      setState("idle");
    };
    r.start();
    setState("recording");
    timer.current = setTimeout(
      () => r.state === "recording" && r.stop(),
      LIMIT_MS,
    );
  }

  if (!supported)
    return <p className="text-muted text-sm">{t.voiceUnsupported}</p>;

  return (
    <div className="space-y-1">
      {state === "recording" ? (
        <button
          type="button"
          className="btn btn-secondary w-full"
          onClick={() => rec.current?.stop()}
        >
          <Square className="size-4" aria-hidden />
          {t.voiceStop}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-secondary w-full"
          disabled={state === "working"}
          onClick={start}
        >
          {state === "working" ? (
            <Spinner />
          ) : (
            <Mic className="size-4" aria-hidden />
          )}
          {state === "working" ? t.voiceWorking : t.voiceStart}
        </button>
      )}
      <p role="status" className="text-sm font-medium">
        {state === "recording" ? t.voiceListening : (message?.text ?? "")}
      </p>
      <p className="text-muted text-xs">{t.voiceHint}</p>
    </div>
  );
}
