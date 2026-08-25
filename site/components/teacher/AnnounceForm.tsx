"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { announce } from "@/app/actions/teacher";

export function AnnounceForm({ courses, isAdmin }: { courses: { id: number; title: string }[]; isAdmin: boolean }) {
  const [f, setF] = useState({ title: "", body: "", url: "/panel", target: "students" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="card max-w-xl space-y-3">
      <div><label className="label">Başlık</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="input" /></div>
      <div><label className="label">Mesaj</label><textarea rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} className="input" /></div>
      <div><label className="label">Bağlantı</label><input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} className="input" placeholder="/panel" /></div>
      <div><label className="label">Hedef</label>
        <select value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} className="input">
          <option value="students">Öğrenciler{isAdmin ? "" : "im"}</option>
          {isAdmin && <option value="teachers">Eğitmenler</option>}
          {isAdmin && <option value="all">Herkes</option>}
          <optgroup label="Kursa göre">{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</optgroup>
        </select>
      </div>
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
      <button disabled={pending} onClick={() => start(async () => { const r = await announce(f.title, f.body, f.url, f.target); setMsg({ ok: r.ok, text: r.ok ? r.message ?? "Gönderildi" : r.error }); if (r.ok) { setF({ ...f, title: "", body: "" }); router.refresh(); } })} className="btn-primary">{pending ? "Gönderiliyor…" : "Gönder"}</button>
      <p className="text-xs text-muted">Uygulama içi bildirim + (izin verenlere) tarayıcı push bildirimi olarak gider.</p>
    </div>
  );
}
