"use client";

import { Toast } from "@/components/Toast";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRawSetting, savePage, deletePage } from "@/app/actions/admin";
import { Icon } from "@/components/site/Icon";

export function AboutForm({ about }: { about: { title: string; html: string } }) {
  const [a, setA] = useState(about);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="card space-y-3">
      <div><label className="label">Başlık</label><input value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} className="input" /></div>
      <div><label className="label">İçerik (HTML)</label><textarea rows={12} value={a.html} onChange={(e) => setA({ ...a, html: e.target.value })} className="input font-mono text-xs" /></div>
      <div className="flex items-center gap-3"><button disabled={pending} onClick={() => start(async () => { const r = await saveRawSetting("about", a); setMsg(r.ok ? "Kaydedildi." : r.error); })} className="btn-primary">Kaydet</button>{msg && <Toast message={msg} ok={msg === "Kaydedildi."} onDone={() => setMsg("")} />}</div>
    </div>
  );
}

type P = { id?: number; slug: string; title: string; html: string; published: boolean };

export function PagesManager({ pages }: { pages: P[] }) {
  const [edit, setEdit] = useState<P | null>(null);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">{msg ? <span className="text-sm text-emerald-700">{msg}</span> : <span />}<button onClick={() => setEdit({ slug: "", title: "", html: "", published: true })} className="btn-primary btn-sm"><Icon name="plus" className="size-4" /> Yeni sayfa</button></div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Başlık</th><th>Adres</th><th>Durum</th><th></th></tr></thead>
          <tbody>{pages.map((p) => <tr key={p.id}><td className="font-semibold text-navy-800">{p.title}</td><td className="text-xs"><a href={`/${p.slug}`} target="_blank" className="text-sky-600 underline">/{p.slug}</a></td><td className="text-xs">{p.published ? "Yayında" : "Gizli"}</td><td className="flex gap-2"><button onClick={() => setEdit(p)} className="btn-secondary btn-sm">Düzenle</button><button disabled={pending} onClick={() => { if (confirm("Sayfa silinsin mi?")) start(async () => { await deletePage(p.id!); router.refresh(); }); }} className="btn-secondary btn-sm text-red-600">Sil</button></td></tr>)}</tbody>
        </table>
      </div>
      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/60 p-4" onClick={() => setEdit(null)}>
          <div className="max-h-[92vh] w-full max-w-3xl space-y-3 overflow-y-auto rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label">Başlık</label><input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} className="input" /></div>
              <div><label className="label">Adres (slug)</label><input value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} className="input" placeholder="kvkk-aydinlatma-metni" /></div>
            </div>
            <div><label className="label">İçerik (HTML)</label><textarea rows={18} value={edit.html} onChange={(e) => setEdit({ ...edit, html: e.target.value })} className="input font-mono text-xs" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.published} onChange={(e) => setEdit({ ...edit, published: e.target.checked })} /> Yayında</label>
            <div className="flex justify-end gap-2"><button onClick={() => setEdit(null)} className="btn-secondary btn-sm">Vazgeç</button><button disabled={pending} onClick={() => start(async () => { const r = await savePage(edit); setMsg(r.ok ? r.message ?? "Kaydedildi" : r.error); if (r.ok) setEdit(null); router.refresh(); })} className="btn-primary btn-sm">Kaydet</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
