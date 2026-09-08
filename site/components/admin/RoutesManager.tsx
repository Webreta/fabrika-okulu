"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRoute, deleteRoute, reorderRoutes, type RouteInput } from "@/app/actions/routes";
import { Icon } from "@/components/site/Icon";
import { RouteMountain, type MountainStep } from "@/components/site/RouteMountain";

type CourseOpt = { id: number; title: string; imageUrl: string; group: string; status: string; shortDescription: string; price: number; isFree: boolean };
type RouteRow = { id: number; name: string; slug: string; description: string; goal: string; active: boolean; steps: { courseId: number; note: string }[] };

const EMPTY: RouteInput = { name: "", description: "", goal: "", active: true, steps: [] };

/**
 * Rota yönetimi: liste (sıralama, aç/kapat, sil) + editör (ad, açıklama, zirve hedefi, sıralı adımlar + adım notu).
 * Sağda canlı önizleme: /rotam sayfasındaki dağ aynı bileşenle çizilir.
 */
export function RoutesManager({ initial, courses }: { initial: RouteRow[]; courses: CourseOpt[] }) {
  const [list, setList] = useState(initial);
  const [form, setForm] = useState<RouteInput | null>(null);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const byId = new Map(courses.map((c) => [c.id, c]));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
    start(async () => { await reorderRoutes(next.map((r) => r.id)); router.refresh(); });
  };
  const moveStep = (i: number, dir: -1 | 1) => {
    if (!form) return;
    const j = i + dir;
    if (j < 0 || j >= form.steps.length) return;
    const next = [...form.steps];
    [next[i], next[j]] = [next[j], next[i]];
    setForm({ ...form, steps: next });
  };
  const submit = () => {
    if (!form) return;
    start(async () => {
      const r = await saveRoute(form);
      setMsg(r.ok ? r.message ?? "Kaydedildi." : r.error);
      if (r.ok) { setForm(null); router.refresh(); }
    });
  };

  const previewSteps: MountainStep[] = (form?.steps ?? []).map((s, i) => {
    const c = byId.get(s.courseId);
    return { id: i, title: c?.title ?? "Eğitim seç", note: s.note, href: "#", imageUrl: c?.imageUrl ?? "", meta: c ? (c.isFree ? "Ücretsiz" : `${c.price.toLocaleString("tr-TR")} ₺`) : "", state: "open" };
  });
  const available = courses.filter((c) => !(form?.steps ?? []).some((s) => s.courseId === c.id));

  if (form) {
    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-bold text-navy-800">{form.id ? "Rotayı düzenle" : "Yeni rota"}</p>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Sitede göster</label>
            </div>
            <div><label className="label">Rota adı</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="Örn. Vardiya Amirliğine Giden Yol" /></div>
            <div><label className="label">Zirvedeki hedef (bayrakta yazar)</label><input value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} className="input" placeholder="Örn. Üretim Müdürü" maxLength={80} /></div>
            <div><label className="label">Açıklama</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input min-h-24" placeholder="Bu rota kimin için, sonunda ne kazanılır?" /></div>
          </div>

          <div className="card">
            <p className="font-bold text-navy-800">Adımlar <span className="text-sm font-normal text-muted">(sırayla: önce 1, sonra 2…)</span></p>
            <p className="mb-3 text-xs text-muted">Her adımın notu, sitede adımın üzerine gelince açılan baloncukta görünür.</p>
            <div className="space-y-2">
              {form.steps.map((s, i) => {
                const c = byId.get(s.courseId);
                return (
                  <div key={i} className="flex gap-3 rounded-xl border border-line bg-surface/50 p-3">
                    <div className="flex flex-col items-center gap-1">
                      <span className="flex size-7 items-center justify-center rounded-full bg-navy-800 text-xs font-bold text-white">{i + 1}</span>
                      <button disabled={i === 0} onClick={() => moveStep(i, -1)} className="rounded p-0.5 text-muted hover:bg-white disabled:opacity-30" title="Yukarı"><Icon name="chevronUp" className="size-4" /></button>
                      <button disabled={i === form.steps.length - 1} onClick={() => moveStep(i, 1)} className="rounded p-0.5 text-muted hover:bg-white disabled:opacity-30" title="Aşağı"><Icon name="chevronDown" className="size-4" /></button>
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <select value={s.courseId} onChange={(e) => setForm({ ...form, steps: form.steps.map((x, j) => (j === i ? { ...x, courseId: Number(e.target.value) } : x)) })} className="input">
                        <option value={0}>Eğitim seç…</option>
                        {(c ? [c, ...available] : available).map((o) => <option key={o.id} value={o.id}>{o.title}{o.status !== "published" ? " (taslak)" : ""}</option>)}
                      </select>
                      <textarea value={s.note} onChange={(e) => setForm({ ...form, steps: form.steps.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })} className="input min-h-16 text-sm" placeholder="Baloncuk notu: bu adımda ne öğrenilir, neden bu sırada?" maxLength={400} />
                    </div>
                    <button onClick={() => setForm({ ...form, steps: form.steps.filter((_, j) => j !== i) })} className="self-start rounded p-1.5 text-red-600 hover:bg-red-50" title="Adımı kaldır"><Icon name="trash" className="size-4" /></button>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setForm({ ...form, steps: [...form.steps, { courseId: 0, note: "" }] })} className="btn-secondary btn-sm mt-3"><Icon name="plus" className="size-3.5" /> Adım ekle</button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button disabled={pending || form.name.trim().length < 2} onClick={submit} className="btn-primary"><Icon name="save" className="size-4" /> Kaydet</button>
            <button onClick={() => { setForm(null); setMsg(""); }} className="btn-secondary">Vazgeç</button>
            {msg && <span className="text-sm text-navy-800">{msg}</span>}
          </div>
        </div>

        <div className="xl:sticky xl:top-6 xl:self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Canlı önizleme</p>
          <div className="overflow-hidden rounded-2xl border border-line">
            <RouteMountain name={form.name || "Rota adı"} goal={form.goal} steps={previewSteps} compact />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{list.length} rota</p>
        <button onClick={() => { setForm({ ...EMPTY, steps: [] }); setMsg(""); }} className="btn-primary"><Icon name="plus" className="size-4" /> Yeni rota</button>
      </div>
      {msg && <p className="text-sm text-navy-800">{msg}</p>}
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th className="w-24">Sıra</th><th>Rota</th><th>Zirve</th><th>Adım</th><th>Durum</th><th className="w-52"></th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted">Henüz rota yok. &quot;Yeni rota&quot; ile başla; sitede Rotam sayfasında dağ yolu olarak görünür.</td></tr>}
            {list.map((r, i) => (
              <tr key={r.id}>
                <td>
                  <span className="flex items-center gap-1">
                    <button disabled={i === 0 || pending} onClick={() => move(i, -1)} className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30"><Icon name="chevronUp" className="size-4" /></button>
                    <button disabled={i === list.length - 1 || pending} onClick={() => move(i, 1)} className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30"><Icon name="chevronDown" className="size-4" /></button>
                  </span>
                </td>
                <td><p className="font-semibold text-navy-800">{r.name}</p>{r.description && <p className="max-w-md truncate text-xs text-muted">{r.description}</p>}</td>
                <td className="text-sm">{r.goal || <span className="text-muted">Zirve</span>}</td>
                <td className="text-sm">{r.steps.length}</td>
                <td>{r.active ? <span className="badge bg-emerald-50 text-emerald-700">Yayında</span> : <span className="badge bg-surface text-muted">Gizli</span>}</td>
                <td>
                  <span className="flex justify-end gap-1">
                    <a href={`/rotam?rota=${r.slug}`} target="_blank" rel="noopener" className="btn-secondary btn-sm"><Icon name="eye" className="size-3.5" /> Gör</a>
                    <button onClick={() => { setForm({ id: r.id, name: r.name, description: r.description, goal: r.goal, active: r.active, steps: r.steps.map((s) => ({ ...s })) }); setMsg(""); }} className="btn-secondary btn-sm"><Icon name="edit" className="size-3.5" /> Düzenle</button>
                    <button disabled={pending} onClick={() => { if (confirm(`"${r.name}" rotası silinsin mi?`)) start(async () => { await deleteRoute(r.id); setList(list.filter((x) => x.id !== r.id)); router.refresh(); }); }} className="rounded p-1.5 text-red-600 hover:bg-red-50" title="Sil"><Icon name="trash" className="size-4" /></button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
