"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { saveRawSetting } from "@/app/actions/admin";
import type { ShowcaseContent } from "@/lib/content-defaults";
import { Icon } from "@/components/site/Icon";
import { Toast } from "@/components/Toast";

type CourseOpt = { id: number; title: string; imageUrl: string; group: string; status: string; closed: boolean; featured: boolean; comingSoon?: boolean };
const GROUP: Record<string, string> = { takvimli: "Takvimli", esnek: "Esnek", ucretsiz: "Ücretsiz" };

/**
 * Anasayfa vitrini: başlık/alt metin, kolon sayısı (2'li / 3'lü dizilim), elle seçilmiş sıralı eğitimler.
 * Seçim boşsa vitrin otomatik dolar: "Öne çıkan" işaretli kurslar önce, sonra sıra numarası; "otomatik kart sayısı" kadar.
 */
export function ShowcaseManager({ initial, courses }: { initial: ShowcaseContent; courses: CourseOpt[] }) {
  const [f, setF] = useState<ShowcaseContent>(initial);
  const [q, setQ] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const byId = new Map(courses.map((c) => [c.id, c]));
  const selected = f.courseIds.map((id) => byId.get(id)).filter((c): c is CourseOpt => !!c);
  const available = courses.filter((c) => !f.courseIds.includes(c.id) && c.title.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr")));
  const setIds = (courseIds: number[]) => setF({ ...f, courseIds });
  const move = (i: number, j: number) => { if (j < 0 || j >= f.courseIds.length) return; const a = [...f.courseIds]; const [x] = a.splice(i, 1); a.splice(j, 0, x); setIds(a); };
  const cols = f.columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="space-y-4">
      <div className="card grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
        <div><label className="label">Bölüm başlığı</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="input" placeholder="Vitrin" /></div>
        <div><label className="label">Alt metin</label><input value={f.sub} onChange={(e) => setF({ ...f, sub: e.target.value })} className="input" placeholder="İsteğe bağlı" /></div>
        <div>
          <label className="label">Dizilim</label>
          <div className="flex overflow-hidden rounded-lg border border-line">
            {([2, 3] as const).map((n) => (
              <button key={n} type="button" onClick={() => setF({ ...f, columns: n })} className={`px-4 py-2 text-sm font-semibold ${f.columns === n ? "bg-navy-800 text-white" : "bg-white text-navy-800 hover:bg-surface"}`}>{n}&apos;li</button>
            ))}
          </div>
        </div>
        <div><label className="label">Otomatik kart sayısı</label><input type="number" min={1} max={24} value={f.limit} onChange={(e) => setF({ ...f, limit: Math.max(1, Number(e.target.value) || 1) })} className="input w-24" title="Elle seçim yoksa kaç kart gösterilsin" /></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="card h-fit space-y-2 lg:sticky lg:top-6">
          <p className="font-bold text-navy-800">Eğitimler</p>
          <p className="text-xs text-muted">Vitrine eklemek için tıkla. Yalnızca yayındaki eğitimler sitede görünür.</p>
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input" placeholder="Ara…" />
          <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
            {available.length === 0 && <li className="py-4 text-center text-xs text-muted">Eğitim yok</li>}
            {available.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setIds([...f.courseIds, c.id])} className="flex w-full items-center gap-2 rounded-lg border border-line bg-white p-1.5 text-left text-sm hover:border-sky-300 hover:bg-sky-50">
                  <div className="aspect-video w-12 shrink-0 overflow-hidden rounded bg-navy-50">{c.imageUrl && <Image src={c.imageUrl} alt="" width={48} height={27} className="h-full w-full object-cover" />}</div>
                  <span className="min-w-0 flex-1 truncate font-medium text-navy-800">{c.featured && <span className="mr-1 text-amber-500">★</span>}{c.title}</span>
                  <span className="text-[10px] text-muted">{c.status !== "published" ? "taslak" : c.closed ? "kapalı" : c.comingSoon ? "yakında" : GROUP[c.group] ?? c.group}</span>
                  <Icon name="plus" className="size-4 shrink-0 text-sky-500" />
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="space-y-4">
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-navy-800">Vitrin dizilimi <span className="text-xs font-normal text-muted">({selected.length} kart · {f.columns}&apos;li)</span></p>
              {selected.length > 0 && <button type="button" onClick={() => setIds([])} className="text-xs font-semibold text-red-600 hover:underline">Seçimi temizle (otomatik moda dön)</button>}
            </div>
            {selected.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">Elle seçim yok. Vitrin otomatik dolar: ★ öne çıkan kurslar önce, sonra sıra numarasına göre, {f.limit} kart.</p>
            ) : (
              <ol className={`mt-3 grid gap-3 ${cols}`}>
                {selected.map((c, i) => (
                  <li
                    key={c.id}
                    draggable
                    onDragStart={() => setDragIdx(i)}
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={(e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== i) move(dragIdx, i); setDragIdx(null); }}
                    onDragEnd={() => setDragIdx(null)}
                    className={`group relative cursor-grab overflow-hidden rounded-2xl border bg-white shadow-sm active:cursor-grabbing ${dragIdx === i ? "border-dashed border-navy-300 opacity-50" : "border-line"}`}
                  >
                    <div className="aspect-video bg-navy-50">{c.imageUrl && <Image src={c.imageUrl} alt="" width={400} height={225} className="h-full w-full object-cover" />}</div>
                    <span className="absolute left-2 top-2 flex size-6 items-center justify-center rounded-full bg-navy-800 text-xs font-bold text-white">{i + 1}</span>
                    <div className="p-3">
                      <p className="truncate text-sm font-semibold text-navy-800">{c.title}</p>
                      <p className="text-[11px] text-muted">{c.status !== "published" ? "Taslak · sitede görünmez" : c.closed ? "Kapalı · sitede görünmez" : c.comingSoon ? "Yakında · rozetle görünür, satış kapalı" : GROUP[c.group] ?? c.group}</p>
                      <div className="mt-2 flex items-center gap-1">
                        <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className="btn-secondary btn-sm px-2" title="Öne al"><Icon name="arrowLeft" className="size-3.5" /></button>
                        <button type="button" onClick={() => move(i, i + 1)} disabled={i === selected.length - 1} className="btn-secondary btn-sm px-2" title="Sona al"><Icon name="arrowRight" className="size-3.5" /></button>
                        <button type="button" onClick={() => setIds(f.courseIds.filter((id) => id !== c.id))} className="btn-secondary btn-sm ml-auto px-2 text-red-600" title="Vitrinden çıkar"><Icon name="x" className="size-3.5" /></button>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="flex items-center justify-end gap-3">
            {msg && <Toast message={msg} ok={msg === "Kaydedildi."} onDone={() => setMsg("")} />}
            <button disabled={pending} onClick={() => start(async () => { const r = await saveRawSetting("showcase", { ...f, title: f.title.trim() || "Vitrin", sub: f.sub.trim() }); setMsg(r.ok ? "Kaydedildi." : r.error); router.refresh(); })} className="btn-primary">{pending ? "…" : "Kaydet"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
