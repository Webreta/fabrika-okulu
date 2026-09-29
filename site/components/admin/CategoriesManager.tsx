"use client";

import { useFieldId } from "@/components/useFieldId";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCategory, deleteCategory, reorderCategories, assignCategoryCourses } from "@/app/actions/categories";
import { saveRawSetting } from "@/app/actions/admin";
import { Icon } from "@/components/site/Icon";
import { LIMITS } from "@/lib/limits";

type Cat = { id: number; name: string; slug: string; description: string; sortOrder: number; count: number; courseIds: number[] };
type CourseOpt = { id: number; title: string; group: string; status: string };

/**
 * Kategori yönetimi: ekle/düzenle/sil, yukarı-aşağı sıralama (header menüsündeki sıra),
 * her kategori için "Eğitimleri dağıt" paneli (onay kutularıyla topluca atama).
 * En üstteki sabit "Tüm Eğitimler" satırı /kesfet sayfasının başlığını ve alt metnini düzenler (ayar: catalog).
 */
export function CategoriesManager({ initial, courses, catalog }: { initial: Cat[]; courses: CourseOpt[]; catalog: { title: string; sub: string } }) {
  const fid = useFieldId();
  const [list, setList] = useState(initial);
  const [all, setAll] = useState(catalog);
  // all: true → form "Tüm Eğitimler" sayfasını düzenliyor (name = sayfa başlığı, description = alt metin)
  const [form, setForm] = useState<{ id?: number; all?: boolean; name: string; description: string }>({ name: "", description: "" });
  const [openId, setOpenId] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const refresh = () => router.refresh();
  const say = (m: string, ok: boolean) => { setMsg(m); setErr(!ok); };
  const submit = () => {
    if (form.name.trim().length > LIMITS.categoryName) return say(`${form.all ? "Sayfa başlığı" : "Kategori adı"} en fazla ${LIMITS.categoryName} karakter olabilir.`, false);
    if (form.description.trim().length > LIMITS.categoryDesc) return say(`${form.all ? "Alt metin" : "Kısa açıklama"} en fazla ${LIMITS.categoryDesc} karakter olabilir.`, false);
    start(async () => {
      if (form.all) {
        const next = { title: form.name.trim(), sub: form.description.trim() };
        const r = await saveRawSetting("catalog", next);
        say(r.ok ? "Kaydedildi." : r.error, r.ok);
        if (r.ok) { setAll(next); setForm({ name: "", description: "" }); refresh(); }
        return;
      }
      const r = await saveCategory({ id: form.id, name: form.name, description: form.description });
      say(r.ok ? r.message ?? "Kaydedildi." : r.error, r.ok);
      if (r.ok) { setForm({ name: "", description: "" }); refresh(); }
    });
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
    start(async () => { await reorderCategories(next.map((k) => k.id)); refresh(); });
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <p className="mb-3 font-bold text-navy-800">{form.all ? "“Tüm Eğitimler” sayfasını düzenle" : form.id ? "Kategoriyi düzenle" : "Yeni kategori"}</p>
        <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
          <div><label htmlFor={fid("a1")} className="label">{form.all ? "Sayfa başlığı" : "Ad"}</label><input id={fid("a1")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={LIMITS.categoryName} className="input" placeholder="Örn. Liderlik ve Yönetim" /></div>
          <div><label htmlFor={fid("a2")} className="label">{form.all ? "Alt metin (başlığın altında)" : "Kısa açıklama (kategori sayfasında)"}</label><input id={fid("a2")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={LIMITS.categoryDesc} className="input" placeholder="İsteğe bağlı" /></div>
          <div className="flex items-end gap-2">
            <button disabled={pending || form.name.trim().length < 2} onClick={submit} className="btn-primary"><Icon name={form.id || form.all ? "save" : "plus"} className="size-4" /> {form.id || form.all ? "Kaydet" : "Ekle"}</button>
            {(form.id || form.all) && <button onClick={() => setForm({ name: "", description: "" })} className="btn-secondary">Vazgeç</button>}
          </div>
        </div>
        {msg && <p role="status" className={`mt-2 text-sm ${err ? "font-semibold text-red-600" : "text-navy-800"}`}>{msg}</p>}
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th className="w-24">Sıra</th><th>Kategori</th><th>Adres</th><th>Eğitim</th><th className="w-64"></th></tr></thead>
          <tbody>
            <tr className="bg-surface/50">
              <td><span className="text-xs text-muted">Sabit</span></td>
              <td className="max-w-sm break-words"><p className="font-semibold text-navy-800">Tüm Eğitimler</p><p className="text-xs text-muted">{all.title}{all.sub && ` · ${all.sub}`}</p></td>
              <td className="text-xs"><a href="/kesfet" target="_blank" rel="noopener" className="text-sky-600 hover:underline">/kesfet</a></td>
              <td className="text-sm">Tümü</td>
              <td>
                <span className="flex flex-wrap justify-end gap-1">
                  <button onClick={() => setForm({ all: true, name: all.title, description: all.sub })} className="btn-secondary btn-sm"><Icon name="edit" className="size-3.5" /> Başlığı düzenle</button>
                </span>
              </td>
            </tr>
            {list.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted">Henüz kategori yok. Yukarıdan ekle; header&apos;daki &quot;Eğitimler&quot; menüsünde bu sırayla listelenir.</td></tr>}
            {list.map((k, i) => (
              <>
                <tr key={k.id}>
                  <td>
                    <span className="flex items-center gap-1">
                      <button disabled={i === 0 || pending} onClick={() => move(i, -1)} className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30" title="Yukarı"><Icon name="chevronUp" className="size-4" /></button>
                      <button disabled={i === list.length - 1 || pending} onClick={() => move(i, 1)} className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30" title="Aşağı"><Icon name="chevronDown" className="size-4" /></button>
                      <span className="text-xs text-muted">{i + 1}</span>
                    </span>
                  </td>
                  <td className="max-w-sm break-words"><p className="font-semibold text-navy-800">{k.name}</p>{k.description && <p className="text-xs text-muted">{k.description}</p>}</td>
                  <td className="max-w-xs break-all text-xs"><a href={`/kategori/${k.slug}`} target="_blank" rel="noopener" className="text-sky-600 hover:underline">/kategori/{k.slug}</a></td>
                  <td className="text-sm">{k.courseIds.length} <span className="text-xs text-muted">({k.count} yayında)</span></td>
                  <td>
                    <span className="flex flex-wrap justify-end gap-1">
                      <button onClick={() => setOpenId(openId === k.id ? null : k.id)} className={`btn-sm ${openId === k.id ? "btn-primary" : "btn-secondary"}`}><Icon name="layers" className="size-3.5" /> Eğitimleri dağıt</button>
                      <button onClick={() => setForm({ id: k.id, name: k.name, description: k.description })} className="btn-secondary btn-sm"><Icon name="edit" className="size-3.5" /> Düzenle</button>
                      <button disabled={pending} onClick={() => { if (confirm(`"${k.name}" silinsin mi? Eğitimler silinmez, yalnızca bu kategoriden çıkar.`)) start(async () => { const r = await deleteCategory(k.id); say(r.ok ? r.message ?? "Kategori silindi." : r.error, r.ok); if (r.ok) { setList(list.filter((x) => x.id !== k.id)); refresh(); } }); }} className="rounded p-1.5 text-red-600 hover:bg-red-50" title="Sil"><Icon name="trash" className="size-4" /></button>
                    </span>
                  </td>
                </tr>
                {openId === k.id && (
                  <tr key={`${k.id}-courses`}>
                    <td colSpan={5} className="bg-surface/60 p-4">
                      <AssignPanel cat={k} courses={courses} onSaved={(ids) => { setList(list.map((x) => (x.id === k.id ? { ...x, courseIds: ids } : x))); refresh(); }} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const GROUP: Record<string, string> = { takvimli: "Takvimli", esnek: "Esnek", ucretsiz: "Ücretsiz" };

function AssignPanel({ cat, courses, onSaved }: { cat: Cat; courses: CourseOpt[]; onSaved: (ids: number[]) => void }) {
  const [sel, setSel] = useState<number[]>(cat.courseIds);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const shown = courses.filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: number) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-navy-800">&quot;{cat.name}&quot; kategorisindeki eğitimler <span className="text-muted">({sel.length})</span></p>
        <input aria-label="Eğitim ara" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Eğitim ara…" className="input ml-auto w-56" />
        <button onClick={() => setSel(shown.map((c) => c.id))} className="btn-secondary btn-sm">Tümünü seç</button>
        <button onClick={() => setSel([])} className="btn-secondary btn-sm">Temizle</button>
        <button disabled={pending} onClick={() => start(async () => { const r = await assignCategoryCourses(cat.id, sel); if (r.ok) { setErr(""); onSaved(sel); } else setErr(r.error); })} className="btn-primary btn-sm"><Icon name="save" className="size-3.5" /> Kaydet</button>
      </div>
      {err && <p role="alert" className="mb-2 text-sm font-semibold text-red-600">{err}</p>}
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => (
          <label key={c.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${sel.includes(c.id) ? "border-navy-800 bg-white" : "border-line bg-white/60 hover:border-navy-300"}`}>
            <input type="checkbox" checked={sel.includes(c.id)} onChange={() => toggle(c.id)} />
            <span className="flex-1 truncate text-navy-800">{c.title}</span>
            <span className="text-[10px] text-muted">{GROUP[c.group] ?? c.group}{c.status !== "published" ? " · taslak" : ""}</span>
          </label>
        ))}
        {shown.length === 0 && <p className="text-sm text-muted">Eşleşen eğitim yok.</p>}
      </div>
    </div>
  );
}
