"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/site/Icon";

type L = { id: number; title: string; type: string; duration: string; done: boolean; active: boolean; locked: boolean };
type M = { id: number; title: string; lessons: L[] };

const TYPE = {
  video: { icon: "play", chip: null, cls: "" },
  quiz: { icon: "quiz", chip: "SINAV", cls: "bg-amber-100 text-amber-700" },
  assign: { icon: "task", chip: "GÖREV", cls: "bg-navy-100 text-navy-800" },
  file: { icon: "file", chip: "DOSYA", cls: "bg-violet-100 text-violet-700" },
} as const;

export function Curriculum({ courseId, modules, progress }: { courseId: number; modules: M[]; progress: { completed: number; total: number; percent: number } }) {
  const activeModule = modules.find((m) => m.lessons.some((l) => l.active))?.id ?? modules[0]?.id;
  const [open, setOpen] = useState<Set<number>>(new Set(activeModule ? [activeModule] : []));
  const toggle = (id: number) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <aside className="lg:sticky lg:top-[88px] lg:self-start">
      <div className="card p-0">
        <div className="border-b border-line p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-navy-800">Müfredat</h2>
            <span className="text-xs text-muted">{progress.completed} / {progress.total} tamamlandı · %{progress.percent}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-100"><div className="h-full bg-sky-400" style={{ width: `${progress.percent}%` }} /></div>
        </div>
        <div className="max-h-[min(66vh,640px)] overflow-y-auto">
          {modules.map((m, mi) => {
            const counted = m.lessons.filter((l) => l.type !== "file");
            const doneN = counted.filter((l) => l.done).length;
            const isOpen = open.has(m.id);
            return (
              <div key={m.id} className="border-b border-line last:border-0">
                <button onClick={() => toggle(m.id)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface">
                  <div>
                    <p className="text-sm font-semibold text-navy-800">Modül {mi + 1}: {m.title}</p>
                    <p className="text-xs text-muted">{counted.length ? `${doneN}/${counted.length} · ${doneN === counted.length ? "tamamlandı" : "devam ediyor"}` : `${m.lessons.length} dosya`}</p>
                  </div>
                  <Icon name={isOpen ? "chevronUp" : "chevronDown"} className="size-4 text-muted" />
                </button>
                {isOpen && (
                  <ul className="pb-2">
                    {m.lessons.map((l) => {
                      const t = TYPE[l.type as keyof typeof TYPE] ?? TYPE.video;
                      const inner = (
                        <>
                          <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${l.done ? "bg-emerald-500 text-white" : l.active ? "bg-navy-800 text-white" : "bg-surface text-muted"}`}>
                            <Icon name={l.done ? "check" : l.locked ? "lock" : t.icon} className="size-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            {l.active && <span className="mb-0.5 inline-block rounded-full bg-navy-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">İzleniyor</span>}
                            <span className={`block truncate text-sm ${l.active ? "font-bold text-navy-900" : "text-ink"}`}>{l.title}</span>
                            {l.locked && <span className="text-[11px] text-muted">Önceki tamamlanınca açılır</span>}
                          </span>
                          {t.chip && <span className={`badge ${t.cls}`}>{t.chip}</span>}
                          {l.type === "video" && l.duration && <span className="text-xs text-muted">{l.duration}</span>}
                        </>
                      );
                      return (
                        <li key={l.id}>
                          {l.locked ? (
                            <div className="flex items-center gap-3 px-4 py-2 opacity-60">{inner}</div>
                          ) : (
                            <Link href={`/kurs-izle/${courseId}?ders=${l.id}`} className={`flex items-center gap-3 px-4 py-2.5 transition ${l.active ? "border-l-4 border-navy-800 bg-navy-800/10 pl-3 shadow-[inset_0_0_0_1px_rgba(20,43,86,.15)]" : "hover:bg-surface"}`}>{inner}</Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
