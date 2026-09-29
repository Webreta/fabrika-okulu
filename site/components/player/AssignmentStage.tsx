"use client";

import { useFieldId } from "@/components/useFieldId";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitAssignment, uploadAssignmentFile, uploadVoice } from "@/app/actions/player";
import { fmtDateTime } from "@/lib/format";
import { Icon } from "@/components/site/Icon";

type Payload = {
  id: number; title: string; description: string; allowFile: boolean; allowVoice: boolean; allowText: boolean; isGraded: boolean; maxScore: number; due: string | null;
  submission: { status: string; score: number | null; feedback: string; text: string; files: { url: string; name: string }[]; voices: { url: string; duration?: number }[]; at: string } | null;
};

export function AssignmentStage({ payload, nextUrl, preview }: { payload: Payload; nextUrl: string | null; preview: boolean }) {
  const fid = useFieldId();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<{ url: string; name: string }[]>([]);
  const [voices, setVoices] = useState<{ url: string; duration?: number }[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const s = payload.submission;
  const overdue = payload.due ? new Date(payload.due).getTime() < Date.now() : false;

  const onFile = async (list: FileList | null) => {
    if (!list) return;
    setBusy(true);
    for (const f of Array.from(list)) {
      const fd = new FormData(); fd.append("file", f);
      const r = await uploadAssignmentFile(fd);
      if (r.ok) setFiles((x) => [...x, { url: r.url, name: r.name }]); else setErr(r.error);
    }
    setBusy(false);
  };

  const submit = () =>
    start(async () => {
      const r = await submitAssignment({ assignmentId: payload.id, text, files, voices });
      if (!r.ok) { setErr(r.error ?? "Hata"); return; }
      router.refresh();
      if (nextUrl) router.push(nextUrl);
    });

  return (
    <div className="card">
      <span className="badge bg-navy-100 text-navy-800">GÖREV</span>
      <h1 className="mt-2 text-2xl font-bold text-navy-800">{payload.title}</h1>
      {payload.due && <p className={`mt-1 text-sm ${overdue && !s ? "text-red-600" : "text-muted"}`}>Son teslim: {fmtDateTime(payload.due)}{overdue && !s ? " (geçti)" : ""}</p>}
      {!payload.due && <p className="mt-1 text-xs text-muted">Süre, kursu ilk açtığın andan (dönemliyse dönem başından) itibaren işler.</p>}
      {payload.description && <div className="prose-fabo mt-4 text-sm whitespace-pre-line">{payload.description}</div>}

      {s ? (
        <div className="mt-6 rounded-xl bg-emerald-50 p-4">
          <p className="font-semibold text-emerald-700">✓ Bu görevi teslim ettin. <span className="font-normal text-muted">({fmtDateTime(s.at)})</span></p>
          {s.text && <p className="mt-3 whitespace-pre-line text-sm">{s.text}</p>}
          {s.files.length > 0 && <ul className="mt-2 space-y-1 text-sm">{s.files.map((f, i) => <li key={i}><a href={f.url} target="_blank" className="text-sky-600 underline">📎 {f.name}</a></li>)}</ul>}
          {s.voices.map((v, i) => <audio key={i} src={v.url} controls className="mt-2 w-full" />)}
          {(s.score !== null || s.feedback) && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-white p-3 text-sm">
              <p className="font-semibold text-navy-800">Eğitmen değerlendirmesi{s.score !== null && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">{s.score}/{payload.maxScore}</span>}</p>
              {s.feedback && <p className="mt-1 whitespace-pre-line text-muted">{s.feedback}</p>}
            </div>
          )}
          {nextUrl && <Link href={nextUrl} className="btn-primary mt-4">Sıradaki içerik <Icon name="arrowRight" className="size-4" /></Link>}
        </div>
      ) : preview ? (
        <p className="mt-6 text-sm text-muted">Önizleme modunda gönderim yapılamaz.</p>
      ) : (
        <div className="mt-6 space-y-5">
          {payload.allowFile && (
            <div>
              <label htmlFor={fid("dosya")} className="label">Dosya</label>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line p-6 text-center text-sm text-muted hover:border-sky-400 hover:bg-sky-50">
                <Icon name="upload" className="mb-2 size-6" />
                {busy ? "Yükleniyor…" : "Dosya seç veya sürükle (PDF, DOCX, ZIP, resim · en fazla 10 MB)"}
                <input id={fid("dosya")} type="file" multiple className="hidden" onChange={(e) => onFile(e.target.files)} />
              </label>
              {files.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center justify-between rounded-lg bg-surface px-3 py-1.5">📎 {f.name}<button aria-label="Dosyayı kaldır" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-red-600"><Icon name="x" className="size-4" /></button></li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {payload.allowVoice && <VoiceRecorder onDone={(v) => setVoices((x) => [...x, v])} voices={voices} onRemove={(i) => setVoices(voices.filter((_, j) => j !== i))} />}
          {payload.allowText && (
            <div>
              <label htmlFor={fid("a1")} className="label">Not / metin</label>
              <textarea id={fid("a1")} rows={5} value={text} onChange={(e) => setText(e.target.value)} className="input" placeholder="Görevle ilgili notlarını yaz…" />
            </div>
          )}
          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <button onClick={submit} disabled={pending || busy} className="btn-primary"><Icon name="send" className="size-4" /> {pending ? "Gönderiliyor…" : "Görevi teslim et"}</button>
        </div>
      )}
    </div>
  );
}

function VoiceRecorder({ onDone, voices, onRemove }: { onDone: (v: { url: string; duration: number }) => void; voices: { url: string; duration?: number }[]; onRemove: (i: number) => void }) {
  const vid = useFieldId()("ses");
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [state, setState] = useState<"idle" | "rec" | "upload">("idle");
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState("");

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const r = new MediaRecorder(stream, { mimeType: mime });
      chunks.current = [];
      r.ondataavailable = (e) => chunks.current.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: mime });
        const duration = Math.round((Date.now() - startAt.current) / 1000);
        setState("upload");
        const fd = new FormData();
        fd.append("file", new File([blob], `ses.${mime.includes("webm") ? "webm" : "m4a"}`, { type: mime }));
        const res = await uploadVoice(fd);
        if (res.ok) onDone({ url: res.url, duration }); else setErr(res.error);
        setState("idle");
      };
      r.start();
      rec.current = r;
      startAt.current = Date.now();
      setSecs(0);
      setState("rec");
      timer.current = setInterval(() => {
        const s = Math.round((Date.now() - startAt.current) / 1000);
        setSecs(s);
        if (s >= 180) stopRec();
      }, 500);
    } catch {
      setErr("Mikrofon erişimi verilmedi.");
    }
  };
  const stopRec = () => {
    if (timer.current) clearInterval(timer.current);
    rec.current?.stop();
  };

  return (
    <div>
      <p id={vid} className="label">Sesli not <span className="text-muted">(en fazla 3 dk)</span></p>
      <div role="group" aria-labelledby={vid} className="flex items-center gap-3 rounded-xl border border-line p-3">
        {state === "rec" ? (
          <button onClick={stopRec} className="btn-danger btn-sm"><Icon name="pause" className="size-4" /> Durdur ({secs}s)</button>
        ) : (
          <button onClick={startRec} disabled={state === "upload"} className="btn-secondary btn-sm"><Icon name="mic" className="size-4" /> {state === "upload" ? "Yükleniyor…" : "Kaydet"}</button>
        )}
        {state === "rec" && <span className="flex items-center gap-1 text-sm text-red-600"><span className="size-2 animate-pulse rounded-full bg-red-600" /> Kaydediliyor</span>}
      </div>
      {err && <p className="mt-1 text-sm text-red-600">{err}</p>}
      {voices.map((v, i) => (
        <div key={i} className="mt-2 flex items-center gap-2">
          <audio src={v.url} controls className="w-full" />
          <button aria-label="Ses kaydını kaldır" onClick={() => onRemove(i)} className="text-red-600"><Icon name="x" className="size-4" /></button>
        </div>
      ))}
    </div>
  );
}
