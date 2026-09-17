"use client";

import { useState, useTransition } from "react";
import { saveSurveyCourses } from "@/app/actions/survey-courses";
import { Icon } from "@/components/site/Icon";

type CourseOpt = { id: number; title: string; group: string; published: boolean };

/**
 * Anketi eğitimlere bağlama (admin). Bağlı eğitimi satın almak isteyen öğrenciye
 * önce bu anketi doldurması söylenir. Çip seçimi; "Bağları kaydet" tüm listeyi baştan yazar.
 */
export function SurveyCourseLinks({ surveyId, courses, initial, published }: { surveyId: number; courses: CourseOpt[]; initial: number[]; published: boolean }) {
  const [sel, setSel] = useState<Set<number>>(() => new Set(initial));
  const [saved, setSaved] = useState<number[]>(initial);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = sel.size !== saved.length || saved.some((id) => !sel.has(id));

  const toggle = (id: number) => {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setMsg(null);
  };
  const save = () =>
    start(async () => {
      const ids = [...sel];
      const r = await saveSurveyCourses(surveyId, ids);
      if (r.ok) setSaved(ids);
      setMsg(r.ok ? { ok: true, text: r.message ?? "Kaydedildi." } : { ok: false, text: r.error });
    });

  const shown = courses.filter((c) => !q || c.title.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr")));

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold text-navy-800"><Icon name="lock" className="size-5 text-sky-600" /> Bağlı eğitimler</h3>
          <p className="mt-1 text-sm text-muted">Seçilen eğitimleri almak isteyen öğrenciye önce bu hedef testini doldurması söylenir; doldurmadan sepete ekleyemez.</p>
          {!published && <p className="mt-1 text-xs font-semibold text-amber-700">Anket taslakta: bağlar kaydedilir ama anket yayınlanana kadar uygulanmaz.</p>}
        </div>
        <button type="button" onClick={save} disabled={pending || !dirty} className="btn-primary btn-sm disabled:opacity-50">{pending ? "Kaydediliyor…" : "Bağları kaydet"}</button>
      </div>
      {msg && <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Eğitim ara…" className="input max-w-xs" />
        <span className="text-xs text-muted">{sel.size} eğitim seçili</span>
        {sel.size > 0 && <button type="button" onClick={() => { setSel(new Set()); setMsg(null); }} className="text-xs font-semibold text-red-600 hover:underline">Tümünü kaldır</button>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {shown.length === 0 && <p className="text-sm text-muted">Eşleşen eğitim yok.</p>}
        {shown.map((c) => {
          const on = sel.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${on ? "border-navy-800 bg-navy-800 text-white" : "border-line bg-white text-navy-800 hover:bg-surface"}`}
            >
              {on && <Icon name="check" className="size-3.5" />}
              {c.title}
              {!c.published && <span className={`rounded-full px-1.5 text-[10px] ${on ? "bg-white/20" : "bg-navy-100 text-navy-700"}`}>taslak</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
