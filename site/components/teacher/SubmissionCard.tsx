"use client";

import { useState } from "react";
import { saveTranscript } from "@/app/actions/teacher";
import { fmtDateTime } from "@/lib/format";
import { Chip } from "@/components/panel/ui";

export type SubmissionRow = {
  id: number; student: string; title: string; course: string; text: string;
  files: { url: string; name: string }[]; voices: { url: string; duration?: number }[];
  status: string; score: number | null; feedback: string; at: string; isGraded: boolean; maxScore: number;
  transcript?: Record<string, string>;
};

/**
 * Tarayıcıda Whisper (transformers.js, CDN) ile ses → metin. Sonuç sunucuda saklanır.
 * İlk kullanımda model (~200 MB) tarayıcıya indirilir; sonrası önbellekten hızlı açılır.
 * Model bir kez yüklenir (sayfa içinde tekrar kullanılır); ilerleme onProgress ile bildirilir.
 */
type AsrPipe = (a: Float32Array, o: object) => Promise<{ text: string }>;
let asrPipe: Promise<AsrPipe> | null = null;

async function transcribe(url: string, onProgress: (msg: string) => void): Promise<string> {
  // Bundler'a takılmadan CDN'den ESM yükle
  const load = new Function("u", "return import(u)") as (u: string) => Promise<{ pipeline: (t: string, m: string, o?: object) => Promise<AsrPipe> }>;
  onProgress("Hazırlanıyor…");
  const mod = await load("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2");
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  const decoded = await ctx.decodeAudioData(buf);
  let data = decoded.getChannelData(0);
  if (decoded.sampleRate !== 16000) {
    const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
    const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
    data = (await off.startRendering()).getChannelData(0);
  }
  if (!asrPipe) {
    // İndirme ilerlemesi: en büyük dosyanın yüzdesi gösterilir
    const pcts: Record<string, number> = {};
    asrPipe = mod.pipeline("automatic-speech-recognition", "Xenova/whisper-small", {
      progress_callback: (p: { status?: string; file?: string; progress?: number }) => {
        if (p.status === "progress" && p.file) {
          pcts[p.file] = p.progress ?? 0;
          const min = Math.floor(Math.min(...Object.values(pcts)));
          onProgress(`Model indiriliyor %${min}`);
        } else if (p.status === "ready") onProgress("Çözümleniyor…");
      },
    });
    asrPipe.catch(() => { asrPipe = null; });
  }
  const pipe = await asrPipe;
  onProgress("Çözümleniyor…");
  const out = await pipe(data, { language: "turkish", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 });
  return out.text.trim();
}

export function SubmissionCard({ row }: { row: SubmissionRow }) {
  const [tr, setTr] = useState<Record<string, string>>(row.transcript ?? {});
  const [busy, setBusy] = useState<number | null>(null);
  const [progress, setProgress] = useState("");
  const doTranscribe = async (i: number) => {
    setBusy(i);
    setProgress("Hazırlanıyor…");
    try {
      const text = await transcribe(row.voices[i].url, setProgress);
      setTr({ ...tr, [i]: text });
      await saveTranscript(row.id, i, text);
    } catch (e) {
      alert("Transkript oluşturulamadı: " + (e instanceof Error ? e.message : "hata"));
    }
    setBusy(null);
    setProgress("");
  };
  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-navy-800">{row.title}</p>
          <p className="text-xs text-muted">{row.student} · {row.course} · {fmtDateTime(row.at)}</p>
        </div>
        <Chip color="sky">Gönderildi</Chip>
      </div>
      {row.text && <p className="mt-3 whitespace-pre-line rounded-lg bg-surface p-3 text-sm">{row.text}</p>}
      {row.files.length > 0 && <ul className="mt-2 space-y-1 text-sm">{row.files.map((f, i) => <li key={i}><a href={f.url} target="_blank" className="text-sky-600 underline">📎 {f.name}</a></li>)}</ul>}
      {row.voices.map((v, i) => (
        <div key={i} className="mt-2">
          <div className="flex items-center gap-2"><audio src={v.url} controls className="w-full" /><button disabled={busy !== null} onClick={() => doTranscribe(i)} className="btn-secondary btn-sm shrink-0">{busy === i ? progress || "Çözümleniyor…" : "Transkript"}</button></div>
          {busy === i && <p className="mt-1 text-[11px] text-muted">İlk kullanımda konuşma tanıma modeli (~200 MB) tarayıcıya indirilir; bu bir kez olur, sonrası hızlıdır. Sayfayı kapatma.</p>}
          {tr[i] && <p className="mt-1 rounded-lg bg-surface p-2 text-xs text-muted">{tr[i]}</p>}
        </div>
      ))}
    </div>
  );
}
