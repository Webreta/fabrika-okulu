"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveEvent, deleteEvent } from "@/app/actions/teacher";
import { Icon } from "@/components/site/Icon";

export function EventForm() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", date: "", startTime: "", endTime: "", color: "#0b2a5e", note: "" });
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary btn-sm"><Icon name="plus" className="size-4" /> Kişisel etkinlik</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold text-navy-800">Yeni etkinlik</p>
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Başlık" className="input" />
            <div className="grid grid-cols-3 gap-2">
              <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="input" />
              <input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} className="input" />
              <input type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} className="input" />
            </div>
            <div className="flex items-center gap-2 text-sm"><span>Renk</span><input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></div>
            <textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Not" className="input" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="btn-secondary btn-sm">Vazgeç</button>
              <button disabled={pending} onClick={() => start(async () => { const r = await saveEvent(f); if (r.ok) { setOpen(false); setF({ title: "", date: "", startTime: "", endTime: "", color: "#0b2a5e", note: "" }); router.refresh(); } })} className="btn-primary btn-sm">Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function DeleteEventButton({ id }: { id: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button disabled={pending} onClick={() => start(async () => { await deleteEvent(id); router.refresh(); })} className="text-red-600" title="Sil"><Icon name="trash" className="size-4" /></button>;
}
