"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/site/Icon";

type L = { id: number; title: string; type: string; icon: IconName; duration: string; preview: boolean };
type M = { id: number; title: string; lessons: L[] };

/** Ders tipine göre ikon rengi */
const TONE: Record<string, string> = {
  video: "bg-sky-50 text-sky-600",
  quiz: "bg-violet-50 text-violet-600",
  assign: "bg-amber-50 text-amber-600",
  file: "bg-emerald-50 text-emerald-600",
};

/** Müfredat akordeonu: numaralı modül başlıkları, ders satırlarında tipe göre renkli ikon ve süre kapsülü */
export function Curriculum({ modules }: { modules: M[] }) {
  const [open, setOpen] = useState<number | null>(modules[0]?.id ?? null);
  if (modules.length === 0) return <p className="mt-4 text-sm text-muted">Müfredat henüz eklenmedi.</p>;
  return (
    <div className="mt-5 space-y-3">
      {modules.map((m, i) => {
        const isOpen = open === m.id;
        return (
          <div key={m.id} className={`overflow-hidden rounded-2xl border transition ${isOpen ? "border-sky-200 bg-white shadow-[0_12px_30px_-20px_rgba(20,43,86,.4)]" : "border-line bg-white hover:border-sky-200"}`}>
            <button onClick={() => setOpen(isOpen ? null : m.id)} aria-expanded={isOpen} className="flex w-full items-center gap-4 px-4 py-3.5 text-left sm:px-5">
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold ${isOpen ? "bg-navy-800 text-white" : "bg-navy-50 text-navy-800"}`}>{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-navy-800">{m.title}</span>
                <span className="block text-xs text-navy-700">{m.lessons.length} bölüm</span>
              </span>
              <Icon name="chevronDown" className={`size-5 shrink-0 text-muted transition duration-300 ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <ul className="border-t border-line">
                {m.lessons.map((l, li) => (
                  <li key={l.id} className={`flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5 ${li % 2 ? "bg-surface/60" : ""}`}>
                    <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${TONE[l.type] ?? "bg-navy-50 text-navy-700"}`}><Icon name={l.icon} className="size-4" /></span>
                    <span className="min-w-0 flex-1 truncate text-navy-800">{l.title}</span>
                    {l.preview && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">Önizleme</span>}
                    {l.duration && <span className="rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-semibold text-navy-700">{l.duration}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
