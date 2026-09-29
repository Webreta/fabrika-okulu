"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/site/Icon";

type Opt = { value: string; label: string };

/**
 * Görevler & Sınavlar filtre çubuğu: kurs, durum ve serbest arama (öğrenci adı / e-posta / görev-sınav başlığı).
 * Seçim değişince adres çubuğu güncellenir (GET parametreleri), arama yazarken kısa gecikmeyle uygulanır.
 */
export function SubmissionsFilter({ base, sekme, courses, statuses, initial }: {
  base: string;
  sekme?: string;
  courses: { id: number; title: string }[];
  statuses: Opt[];
  initial: { course: string; q: string; durum: string };
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);
  const [course, setCourse] = useState(initial.course);
  const [durum, setDurum] = useState(initial.durum);
  const first = useRef(true);

  const apply = (next: { q?: string; course?: string; durum?: string }) => {
    const p = new URLSearchParams();
    if (sekme) p.set("sekme", sekme);
    const v = { q, course, durum, ...next };
    if (v.course) p.set("course", v.course);
    if (v.durum) p.set("durum", v.durum);
    if (v.q.trim()) p.set("q", v.q.trim());
    router.push(`${base}?${p.toString()}`);
  };

  // Arama: yazmayı bıraktıktan 350 ms sonra uygula
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => apply({ q }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = !!(course || durum || q.trim());
  return (
    <form onSubmit={(e) => { e.preventDefault(); apply({}); }} className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1 sm:max-w-sm">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input aria-label="Öğrenci adı, e-posta ya da başlık" value={q} onChange={(e) => setQ(e.target.value)} className="input pl-9" placeholder="Öğrenci adı, e-posta ya da başlık…" />
      </div>
      <select aria-label="Eğitim" value={course} onChange={(e) => { setCourse(e.target.value); apply({ course: e.target.value }); }} className="input w-full max-w-full sm:w-auto">
        <option value="">Tüm kurslar</option>
        {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
      {/* Görev teslimlerinde durum yoktur (puanlama yapılmaz); durum süzgeci yalnızca seçenek varsa görünür */}
      {statuses.length > 0 && (
        <select aria-label="Durum" value={durum} onChange={(e) => { setDurum(e.target.value); apply({ durum: e.target.value }); }} className="input w-full max-w-full sm:w-auto">
          <option value="">Tüm durumlar</option>
          {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      )}
      {active && (
        <button type="button" onClick={() => { setQ(""); setCourse(""); setDurum(""); router.push(sekme ? `${base}?sekme=${sekme}` : base); }} className="btn-secondary btn-sm">
          <Icon name="x" className="size-3.5" /> Temizle
        </button>
      )}
    </form>
  );
}
