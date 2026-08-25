"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gradeSubmission, saveTranscript } from "@/app/actions/teacher";
import { fmtDateTime } from "@/lib/format";
import { Chip } from "@/components/panel/ui";

export type SubmissionRow = {
  id: number; student: string; title: string; course: string; text: string;
  files: { url: string; name: string }[]; voices: { url: string; duration?: number }[];
  status: string; score: number | null; feedback: string; at: string; isGraded: boolean; maxScore: number;
  transcript?: Record<string, string>;
};

/** Tarayıcıda Whisper (transformers.js, CDN) ile ses → metin. Sonuç sunucuda saklanır. */
async function transcribe(url: string): Promise<string> {
  // Bundler'a takılmadan CDN'den ESM yükle
  const load = new Function("u", "return import(u)") as (u: string) => Promise<{ pipeline: (t: string, m: string) => Promise<(a: Float32Array, o: object) => Promise<{ text: string }>> }>;
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
  const pipe = await mod.pipeline("automatic-speech-recognition", "Xenova/whisper-small");
  const out = await pipe(data, { language: "turkish", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 });
  return out.text.trim();
}

export function SubmissionCard({ row }: { row: SubmissionRow }) {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(row.score ?? (row.isGraded ? 0 : 100));
  const [feedback, setFeedback] = useState(row.feedback);
  const [tr, setTr] = useState<Record<string, string>>(row.transcript ?? {});
  const [busy, setBusy] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const max = row.isGraded ? row.maxScore : 100;
  const doTranscribe = async (i: number) => {
    setBusy(i);
    try {
      const text = await transcribe(row.voices[i].url);
      setTr({ ...tr, [i]: text });
      await saveTranscript(row.id, i, text);
    } catch (e) {
      alert("Transkript oluşturulamadı: " + (e instanceof Error ? e.message : "hata"));
    }
    setBusy(null);
  };
  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-navy-800">{row.title}</p>
          <p className="text-xs text-muted">{row.student} · {row.course} · {fmtDateTime(row.at)}</p>
        </div>
        <Chip color={row.status === "graded" ? "green" : "amber"}>{row.status === "graded" ? `Değerlendirildi · ${row.score}/${max}` : "Bekliyor"}</Chip>
      </div>
      {row.text && <p className="mt-3 whitespace-pre-line rounded-lg bg-surface p-3 text-sm">{row.text}</p>}
      {row.files.length > 0 && <ul className="mt-2 space-y-1 text-sm">{row.files.map((f, i) => <li key={i}><a href={f.url} target="_blank" className="text-sky-600 underline">📎 {f.name}</a></li>)}</ul>}
      {row.voices.map((v, i) => (
        <div key={i} className="mt-2">
          <div className="flex items-center gap-2"><audio src={v.url} controls className="w-full" /><button disabled={busy !== null} onClick={() => doTranscribe(i)} className="btn-secondary btn-sm shrink-0">{busy === i ? "Çözümleniyor…" : "Transkript"}</button></div>
          {tr[i] && <p className="mt-1 rounded-lg bg-surface p-2 text-xs text-muted">{tr[i]}</p>}
        </div>
      ))}
      {row.status === "graded" && row.feedback && <p className="mt-2 text-sm text-muted">Geri bildirim: {row.feedback}</p>}
      <button onClick={() => setOpen(!open)} className="mt-3 text-sm font-semibold text-navy-800">{open ? "▾" : "▸"} {row.status === "graded" ? "Yeniden değerlendir" : "Değerlendir"}</button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-line p-3">
          <div className="flex items-center gap-2 text-sm"><span>Puan</span><input type="number" min={0} max={max} value={score} onChange={(e) => setScore(Number(e.target.value))} className="input w-24" /><span className="text-muted">/ {max}</span></div>
          <textarea rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Geri bildirim" className="input" />
          <button disabled={pending} onClick={() => start(async () => { await gradeSubmission(row.id, score, feedback); setOpen(false); router.refresh(); })} className="btn-primary btn-sm">{pending ? "Kaydediliyor…" : "Kaydet ve bildir"}</button>
        </div>
      )}
    </div>
  );
}
