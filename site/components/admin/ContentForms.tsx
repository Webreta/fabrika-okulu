"use client";

import { Toast } from "@/components/Toast";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRawSetting, savePage, deletePage } from "@/app/actions/admin";
import { Icon } from "@/components/site/Icon";
import type { FaqContent } from "@/lib/content-defaults";

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={() => setEdit(null)}>
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

/** Anasayfa "Merak Edilenler": başlık, alt metin ve sıralı soru-cevap listesi */
export function FaqForm({ faq }: { faq: FaqContent }) {
  const [f, setF] = useState<FaqContent>(faq);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const setItem = (i: number, patch: Partial<FaqContent["items"][number]>) => setF({ ...f, items: f.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= f.items.length) return; const items = [...f.items]; [items[i], items[j]] = [items[j], items[i]]; setF({ ...f, items }); };
  return (
    <div className="card space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <div><label className="label">Bölüm başlığı</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="input" /></div>
        <div><label className="label">Alt metin</label><input value={f.sub} onChange={(e) => setF({ ...f, sub: e.target.value })} className="input" /></div>
        <div><label className="label">Anasayfada kaç soru</label><input type="number" min={1} max={50} value={f.homeLimit ?? 6} onChange={(e) => setF({ ...f, homeLimit: Math.max(1, Number(e.target.value) || 1) })} className="input w-24" title="Anasayfada ilk kaç soru görünsün; tamamı S.S.S. sayfasında" /></div>
      </div>
      <div className="space-y-3">
        {f.items.map((it, i) => (
          <div key={i} className="rounded-xl border border-line p-3">
            <div className="flex items-start gap-2">
              <span className="mt-2 w-6 shrink-0 text-center text-sm font-bold text-muted">{i + 1}</span>
              <div className="min-w-0 flex-1 space-y-2">
                <input value={it.q} onChange={(e) => setItem(i, { q: e.target.value })} className="input font-semibold" placeholder="Soru" />
                <textarea rows={3} value={it.a} onChange={(e) => setItem(i, { a: e.target.value })} className="input" placeholder="Cevap" />
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="btn-secondary btn-sm px-2" title="Yukarı"><Icon name="chevronUp" className="size-4" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === f.items.length - 1} className="btn-secondary btn-sm px-2" title="Aşağı"><Icon name="chevronDown" className="size-4" /></button>
                <button type="button" onClick={() => setF({ ...f, items: f.items.filter((_, j) => j !== i) })} className="btn-secondary btn-sm px-2 text-red-600" title="Sil"><Icon name="trash" className="size-4" /></button>
              </div>
            </div>
          </div>
        ))}
        {f.items.length === 0 && <p className="text-sm text-muted">Soru yok; bölüm anasayfada ve S.S.S. sayfasında görünmez.</p>}
        {f.items.length > 0 && <p className="text-xs text-muted">İlk {f.homeLimit ?? 6} soru anasayfada, tamamı <a href="/sss" target="_blank" className="text-sky-600 underline">/sss</a> sayfasında görünür.</p>}
      </div>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setF({ ...f, items: [...f.items, { q: "", a: "" }] })} className="btn-secondary btn-sm"><Icon name="plus" className="size-4" /> Soru ekle</button>
        <div className="flex items-center gap-3">
          <button disabled={pending} onClick={() => start(async () => { const clean = { ...f, items: f.items.map((it) => ({ q: it.q.trim(), a: it.a.trim() })).filter((it) => it.q) }; setF(clean); const r = await saveRawSetting("faq", clean); setMsg(r.ok ? "Kaydedildi." : r.error); })} className="btn-primary">Kaydet</button>
          {msg && <Toast message={msg} ok={msg === "Kaydedildi."} onDone={() => setMsg("")} />}
        </div>
      </div>
    </div>
  );
}
