"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveNote, deleteNote } from "@/app/actions/notes";
import { relTime } from "@/lib/format";
import { Icon } from "@/components/site/Icon";
import type { NoteItem } from "@/components/player/NotesPanel";
import { VIDEO_PAUSE_EVENT } from "@/lib/player-events";

/**
 * Oynatıcı sağ sütununun en üstündeki "Genel not al" düğmesi: ders ve saniyeye bağlı olmayan notlar için açılır pencere.
 * Her içerik türünde (video, sınav, görev, dosya) kullanılabilir; açılınca oynayan video duraklatılır. Pencerede yeni not
 * alanı ve daha önce alınmış genel notlar kaydırılabilir listede durur (düzenle/sil).
 */
export function GeneralNotesButton({ courseId, notes, total }: { courseId: number; notes: NoteItem[]; total: number }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const show = () => {
    window.dispatchEvent(new CustomEvent(VIDEO_PAUSE_EVENT));
    setErr("");
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const submit = () =>
    start(async () => {
      const r = await saveNote({ courseId, lessonId: null, seconds: null, text });
      if (r.ok) { setText(""); setErr(""); router.refresh(); } else setErr(r.error);
    });

  return (
    <>
      <button onClick={show} className="btn-secondary w-full justify-center">
        <Icon name="edit" className="size-4" /> Genel not al{notes.length > 0 && <span className="rounded-full bg-navy-800 px-1.5 text-[10px] font-bold text-white">{notes.length}</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/60 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Genel notlar" className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="flex items-center gap-2 font-bold text-navy-800"><Icon name="edit" className="size-4" /> Genel notlarım</h2>
              <button onClick={() => setOpen(false)} aria-label="Kapat" className="rounded-lg p-1.5 text-muted hover:bg-surface"><Icon name="x" className="size-5" /></button>
            </div>
            <div className="border-b border-line bg-sky-50 p-4">
              <textarea aria-label="Yeni genel not" autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(); }} placeholder="Notunu yaz… (Ctrl+Enter kaydeder)" maxLength={1000} className="input" />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className={`text-[11px] ${text.length >= 1000 ? "text-red-600" : "text-muted"}`}>{text.length}/1000 · {total}/100 not</span>
                <button onClick={submit} disabled={pending || !text.trim()} className="btn-primary btn-sm">{pending ? "…" : "Kaydet"}</button>
              </div>
              {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {notes.length === 0 ? (
                <p className="text-sm text-muted">Henüz genel notun yok. Derse bağlı olmayan düşüncelerini buraya yazabilirsin.</p>
              ) : (
                <ul className="space-y-2">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded-xl border border-line bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="date-chip">{relTime(n.createdAt)}</span>
                        <div className="flex shrink-0 gap-1">
                          <button onClick={() => { setEditing(n.id); setEditText(n.text); }} className="rounded p-1 text-muted hover:bg-surface" title="Düzenle" aria-label="Düzenle"><Icon name="edit" className="size-3.5" /></button>
                          <button onClick={() => start(async () => { await deleteNote(n.id); router.refresh(); })} className="rounded p-1 text-red-600 hover:bg-red-50" title="Sil" aria-label="Sil"><Icon name="trash" className="size-3.5" /></button>
                        </div>
                      </div>
                      {editing === n.id ? (
                        <div className="mt-2">
                          <textarea aria-label="Not" rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} maxLength={1000} className="input" />
                          <div className="mt-1 flex justify-end gap-2"><button onClick={() => setEditing(null)} className="btn-secondary btn-sm">Vazgeç</button><button onClick={() => start(async () => { await saveNote({ id: n.id, text: editText }); setEditing(null); router.refresh(); })} className="btn-primary btn-sm">Kaydet</button></div>
                        </div>
                      ) : (
                        <p className="mt-1 whitespace-pre-line text-sm">{n.text}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-line px-5 py-2.5 text-right"><Link href="/panel/notlar" className="text-xs font-semibold text-sky-600 hover:underline">Tüm notlarım →</Link></div>
          </div>
        </div>
      )}
    </>
  );
}
