"use client";

import { useFieldId } from "@/components/useFieldId";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { announce } from "@/app/actions/teacher";

export function AnnounceForm({ courses, isAdmin }: { courses: { id: number; title: string }[]; isAdmin: boolean }) {
  const fid = useFieldId();
  const [f, setF] = useState({ title: "", body: "", url: "/panel", target: "students" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="card max-w-xl space-y-3">
      <div><label htmlFor={fid("a1")} className="label">Başlık</label><input id={fid("a1")} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={150} className="input" /></div>
      <div><label htmlFor={fid("a2")} className="label">Mesaj</label><textarea id={fid("a2")} rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={1000} className="input" /></div>
      <div><label htmlFor={fid("a3")} className="label">Bağlantı</label><input id={fid("a3")} value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} maxLength={500} className="input" placeholder="/panel" /><p className="mt-1 text-[11px] text-muted">Site içi yol (örnek: /panel/egitim) ya da https:// ile başlayan adres.</p></div>
      <div><label htmlFor={fid("a4")} className="label">Hedef</label>
        <select id={fid("a4")} value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} className="input">
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
