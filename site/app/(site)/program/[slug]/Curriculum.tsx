"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/site/Icon";

type L = { id: number; title: string; type: string; icon: IconName; duration: string; preview: boolean };
type M = { id: number; title: string; lessons: L[] };

export function Curriculum({ modules }: { modules: M[] }) {
  const [open, setOpen] = useState<number | null>(modules[0]?.id ?? null);
  if (modules.length === 0) return <p className="mt-4 text-sm text-muted">Müfredat henüz eklenmedi.</p>;
  return (
    <div className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line">
      {modules.map((m, i) => {
        const isOpen = open === m.id;
        return (
          <div key={m.id}>
            <button onClick={() => setOpen(isOpen ? null : m.id)} className="flex w-full items-center justify-between bg-surface px-4 py-3 text-left">
              <span className="font-semibold text-navy-800">Modül {i + 1}: {m.title}</span>
              <span className="flex items-center gap-3 text-xs text-muted">{m.lessons.length} Bölüm <Icon name={isOpen ? "chevronUp" : "chevronDown"} className="size-4" /></span>
            </button>
            {isOpen && (
              <ul className="divide-y divide-line bg-white">
                {m.lessons.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <Icon name={l.icon} className="size-4 shrink-0 text-sky-500" />
                    <span className="flex-1">{l.title}</span>
                    {l.preview && <span className="badge bg-sky-50 text-sky-700">Önizleme</span>}
                    {l.duration && <span className="text-xs text-muted">{l.duration}</span>}
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
