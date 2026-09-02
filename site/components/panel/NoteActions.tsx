"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveNote, deleteNote } from "@/app/actions/notes";
import { Icon } from "@/components/site/Icon";

export function NoteActions({ id, text, href }: { id: number; text: string; href: string | null }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(text);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex shrink-0 items-center gap-1">
      {href && <Link href={href} className="btn-secondary btn-sm"><Icon name="play" className="size-3.5" /> Git</Link>}
      <button onClick={() => setEdit(true)} className="rounded p-1.5 text-muted hover:bg-surface" title="Düzenle"><Icon name="edit" className="size-4" /></button>
      <button disabled={pending} onClick={() => { if (confirm("Not silinsin mi?")) start(async () => { await deleteNote(id); router.refresh(); }); }} className="rounded p-1.5 text-red-600 hover:bg-red-50" title="Sil"><Icon name="trash" className="size-4" /></button>
      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={() => setEdit(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 font-bold text-navy-800">Notu düzenle</p>
            <textarea rows={5} value={val} onChange={(e) => setVal(e.target.value)} maxLength={1000} className="input" /><p className="mt-1 text-right text-[11px] text-muted">{val.length}/1000</p>
            <div className="mt-3 flex justify-end gap-2"><button onClick={() => setEdit(false)} className="btn-secondary btn-sm">Vazgeç</button><button disabled={pending} onClick={() => start(async () => { await saveNote({ id, text: val }); setEdit(false); router.refresh(); })} className="btn-primary btn-sm">Kaydet</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

export function GeneralNoteForm() {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary"><Icon name="plus" className="size-4" /> Genel not</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 font-bold text-navy-800">Genel not</p>
            <textarea autoFocus rows={5} value={val} onChange={(e) => setVal(e.target.value)} placeholder="Notunu yaz…" className="input" />
            <div className="mt-3 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="btn-secondary btn-sm">Vazgeç</button><button disabled={pending || !val.trim()} onClick={() => start(async () => { await saveNote({ text: val }); setOpen(false); setVal(""); router.refresh(); })} className="btn-primary btn-sm">Kaydet</button></div>
          </div>
        </div>
      )}
    </>
  );
}
