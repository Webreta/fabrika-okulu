"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCategory, deleteCategory, reorderCategories, assignCategoryCourses } from "@/app/actions/categories";
import { Icon } from "@/components/site/Icon";

type Cat = { id: number; name: string; slug: string; description: string; sortOrder: number; count: number; courseIds: number[] };
type CourseOpt = { id: number; title: string; group: string; status: string };

/**
 * Kategori yönetimi: ekle/düzenle/sil, yukarı-aşağı sıralama (header menüsündeki sıra),
 * her kategori için "Eğitimleri dağıt" paneli (onay kutularıyla topluca atama).
 */
export function CategoriesManager({ initial, courses }: { initial: Cat[]; courses: CourseOpt[] }) {
  const [list, setList] = useState(initial);
  const [form, setForm] = useState<{ id?: number; name: string; description: string }>({ name: "", description: "" });
  const [openId, setOpenId] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const refresh = () => router.refresh();
  const submit = () =>
    start(async () => {
      const r = await saveCategory(form);
      setMsg(r.ok ? r.message ?? "Kaydedildi." : r.error);
      if (r.ok) { setForm({ name: "", description: "" }); refresh(); }
    });
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
        <p className="mb-3 font-bold text-navy-800">{form.id ? "Kategoriyi düzenle" : "Yeni kategori"}</p>
        <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
          <div><label className="label">Ad</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="Örn. Liderlik ve Yönetim" /></div>
          <div><label className="label">Kısa açıklama (kategori sayfasında)</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" placeholder="İsteğe bağlı" /></div>
          <div className="flex items-end gap-2">
            <button disabled={pending || form.name.trim().length < 2} onClick={submit} className="btn-primary"><Icon name={form.id ? "save" : "plus"} className="size-4" /> {form.id ? "Kaydet" : "Ekle"}</button>
            {form.id && <button onClick={() => setForm({ name: "", description: "" })} className="btn-secondary">Vazgeç</button>}
          </div>
        </div>
        {msg && <p className="mt-2 text-sm text-navy-800">{msg}</p>}
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th className="w-24">Sıra</th><th>Kategori</th><th>Adres</th><th>Eğitim</th><th className="w-64"></th></tr></thead>
          <tbody>
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
                  <td><p className="font-semibold text-navy-800">{k.name}</p>{k.description && <p className="text-xs text-muted">{k.description}</p>}</td>
                  <td className="text-xs"><a href={`/kategori/${k.slug}`} target="_blank" rel="noopener" className="text-sky-600 hover:underline">/kategori/{k.slug}</a></td>
                  <td className="text-sm">{k.courseIds.length} <span className="text-xs text-muted">({k.count} yayında)</span></td>
                  <td>
                    <span className="flex flex-wrap justify-end gap-1">
                      <button onClick={() => setOpenId(openId === k.id ? null : k.id)} className={`btn-sm ${openId === k.id ? "btn-primary" : "btn-secondary"}`}><Icon name="layers" className="size-3.5" /> Eğitimleri dağıt</button>
                      <button onClick={() => setForm({ id: k.id, name: k.name, description: k.description })} className="btn-secondary btn-sm"><Icon name="edit" className="size-3.5" /> Düzenle</button>
                      <button disabled={pending} onClick={() => { if (confirm(`"${k.name}" silinsin mi? Eğitimler silinmez, yalnızca bu kategoriden çıkar.`)) start(async () => { await deleteCategory(k.id); setList(list.filter((x) => x.id !== k.id)); refresh(); }); }} className="rounded p-1.5 text-red-600 hover:bg-red-50" title="Sil"><Icon name="trash" className="size-4" /></button>
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
  const shown = courses.filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: number) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-navy-800">&quot;{cat.name}&quot; kategorisindeki eğitimler <span className="text-muted">({sel.length})</span></p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Eğitim ara…" className="input ml-auto w-56" />
        <button onClick={() => setSel(shown.map((c) => c.id))} className="btn-secondary btn-sm">Tümünü seç</button>
        <button onClick={() => setSel([])} className="btn-secondary btn-sm">Temizle</button>
        <button disabled={pending} onClick={() => start(async () => { await assignCategoryCourses(cat.id, sel); onSaved(sel); })} className="btn-primary btn-sm"><Icon name="save" className="size-3.5" /> Kaydet</button>
      </div>
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
