"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveNote, deleteNote } from "@/app/actions/notes";
import { relTime } from "@/lib/format";
import { Icon } from "@/components/site/Icon";

export type NoteItem = { id: number; lessonId: number | null; lessonTitle: string; seconds: number | null; text: string; createdAt: string };

export function fmtSecs(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * Ders altındaki "Notlar" sekmesi.
 * "Burada not al" → o dersin o anki saniyesine bağlı not; "Genel not al" → derse/saniyeye bağlı olmayan not.
 */
export function NotesPanel({ courseId, lessonId, lessonTitle, notes, getTime, description, canTimestamp }: {
  courseId: number; lessonId: number; lessonTitle: string; notes: NoteItem[];
  getTime: () => number; description?: string; canTimestamp: boolean;
}) {
  const [mode, setMode] = useState<null | { seconds: number | null }>(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const open = (timed: boolean) => {
    setMode({ seconds: timed ? Math.floor(getTime()) : null });
    setText("");
  };
  const submit = () =>
    start(async () => {
      const r = await saveNote({ courseId, lessonId: mode?.seconds !== null ? lessonId : null, seconds: mode?.seconds ?? null, text });
      if (r.ok) { setMode(null); setText(""); setErr(""); router.refresh(); } else setErr(r.error);
    });
  const noteHref = (n: NoteItem) => (n.lessonId ? `/kurs-izle/${courseId}?ders=${n.lessonId}${n.seconds != null ? `&t=${n.seconds}` : ""}` : null);

  return (
    <div className="space-y-4">
      {description && <div className="prose-fabo rounded-xl bg-surface p-4 text-sm" dangerouslySetInnerHTML={{ __html: description }} />}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => open(true)} disabled={!canTimestamp} title={canTimestamp ? "" : "Bu video türünde zaman bilgisi alınamıyor"} className={`btn-sm ${mode && mode.seconds !== null ? "btn-primary" : "btn-secondary"}`}><Icon name="clock" className="size-4" /> Burada not al</button>
        <button onClick={() => open(false)} className={`btn-sm ${mode && mode.seconds === null ? "btn-primary" : "btn-secondary"}`}><Icon name="edit" className="size-4" /> Genel not al</button>
        <span className="ml-auto self-center text-xs text-muted">{notes.length}/100</span>
        <Link href="/panel/notlar" className="btn-secondary btn-sm">Tüm notlarım →</Link>
      </div>

      {mode && (
        <div className="rounded-xl border border-sky-300 bg-sky-50 p-3">
          <p className="mb-2 text-xs font-semibold text-navy-800">
            {mode.seconds !== null ? <>📍 {lessonTitle} · <span className="rounded bg-navy-800 px-1.5 py-0.5 text-white">{fmtSecs(mode.seconds)}</span></> : "📝 Genel not"}
          </p>
          <textarea autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(); }} placeholder="Notunu yaz… (Ctrl+Enter kaydeder)" maxLength={1000} className="input" />
          <p className={`mt-1 text-right text-[11px] ${text.length >= 1000 ? "text-red-600" : "text-muted"}`}>{text.length}/1000</p>
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setMode(null)} className="btn-secondary btn-sm">Vazgeç</button>
            <button onClick={submit} disabled={pending || !text.trim()} className="btn-primary btn-sm">{pending ? "…" : "Kaydet"}</button>
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <p className="text-sm text-muted">Bu programda henüz notun yok.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => {
            const href = noteHref(n);
            return (
              <li key={n.id} className="rounded-xl border border-line bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-xs text-muted">
                    {href ? (
                      <Link href={href} className="inline-flex items-center gap-1 font-semibold text-sky-600 hover:underline">
                        <Icon name="play" className="size-3" /> {n.lessonTitle}{n.seconds != null && ` · ${fmtSecs(n.seconds)}`}
                      </Link>
                    ) : (
                      <span className="font-semibold text-navy-800">Genel not</span>
                    )}
                    <span> · {relTime(n.createdAt)}</span>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => { setEditing(n.id); setEditText(n.text); }} className="rounded p-1 text-muted hover:bg-surface" title="Düzenle"><Icon name="edit" className="size-3.5" /></button>
                    <button onClick={() => start(async () => { await deleteNote(n.id); router.refresh(); })} className="rounded p-1 text-red-600 hover:bg-red-50" title="Sil"><Icon name="trash" className="size-3.5" /></button>
                  </div>
                </div>
                {editing === n.id ? (
                  <div className="mt-2">
                    <textarea rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} maxLength={1000} className="input" /><p className="mt-1 text-right text-[11px] text-muted">{editText.length}/1000</p>
                    <div className="mt-1 flex justify-end gap-2"><button onClick={() => setEditing(null)} className="btn-secondary btn-sm">Vazgeç</button><button onClick={() => start(async () => { await saveNote({ id: n.id, text: editText }); setEditing(null); router.refresh(); })} className="btn-primary btn-sm">Kaydet</button></div>
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-line text-sm">{n.text}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
