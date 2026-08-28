"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { relTime } from "@/lib/format";
import { Chip } from "@/components/panel/ui";
import { Icon } from "@/components/site/Icon";
import { NoteActions } from "@/components/panel/NoteActions";

export type BrowserNote = { id: number; courseId: number | null; courseTitle: string | null; lessonId: number | null; lessonTitle: string; seconds: number | null; text: string; createdAt: string };

const PAGE_SIZE = 20;

function fmtSecs(s: number) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`; }
function norm(s: string) { return s.toLocaleLowerCase("tr-TR"); }

/** Notlarım: kurs / ders filtresi + anlık arama (sayfa yenilenmeden), 20'şerli sayfalama */
export function NotesBrowser({ notes }: { notes: BrowserNote[] }) {
  const [q, setQ] = useState("");
  const [courseId, setCourseId] = useState<number | "">("");
  const [lessonId, setLessonId] = useState<number | "">("");
  const [page, setPage] = useState(1);

  const courses = useMemo(() => {
    const m = new Map<number, string>();
    notes.forEach((n) => { if (n.courseId && n.courseTitle) m.set(n.courseId, n.courseTitle); });
    return [...m.entries()].map(([id, title]) => ({ id, title }));
  }, [notes]);
  const lessonsOf = useMemo(() => {
    const m = new Map<number, string>();
    notes.forEach((n) => { if (n.lessonId && (courseId === "" || n.courseId === courseId)) m.set(n.lessonId, n.lessonTitle); });
    return [...m.entries()].map(([id, title]) => ({ id, title }));
  }, [notes, courseId]);

  const list = notes.filter((n) => {
    if (courseId !== "" && n.courseId !== courseId) return false;
    if (lessonId !== "" && n.lessonId !== lessonId) return false;
    if (q.trim()) {
      const t = norm(q.trim());
      return norm(n.text).includes(t) || norm(n.lessonTitle).includes(t) || norm(n.courseTitle ?? "").includes(t);
    }
    return true;
  });

  // Filtre değişince ilk sayfaya dön
  useEffect(() => { setPage(1); }, [q, courseId, lessonId]);

  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageItems = list.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const groups = new Map<string, BrowserNote[]>();
  for (const n of pageItems) { const k = n.courseTitle ?? "Genel notlar"; groups.set(k, [...(groups.get(k) ?? []), n]); }

  return (
    <div className="space-y-5">
      <div className="card grid grid-cols-1 items-center gap-2 md:grid-cols-[1fr_260px_260px_auto]">
        <div className="relative">
          <Icon name="search" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Notlarda ara…" className="input pl-9" />
        </div>
        <select value={courseId} onChange={(e) => { setCourseId(e.target.value ? Number(e.target.value) : ""); setLessonId(""); }} className="input w-full truncate">
          <option value="">Tüm kurslar</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <select value={lessonId} onChange={(e) => setLessonId(e.target.value ? Number(e.target.value) : "")} className="input w-full truncate">
          <option value="">Tüm dersler</option>{lessonsOf.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
        </select>
        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
          <span className="text-xs text-muted">{list.length} not</span>
          <button onClick={() => { setQ(""); setCourseId(""); setLessonId(""); }} disabled={!q && courseId === "" && lessonId === ""} className="btn-secondary btn-sm disabled:opacity-40">Temizle</button>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="card text-center text-muted">Eşleşen not yok.</p>
      ) : (
        <>
        {[...groups.entries()].map(([title, items]) => (
          <div key={title}>
            <h2 className="mb-2 font-bold text-navy-800">{title} <span className="text-xs font-normal text-muted">({items.length})</span></h2>
            <ul className="space-y-2">
              {items.map((n) => {
                const href = n.lessonId && n.courseId ? `/kurs-izle/${n.courseId}?ders=${n.lessonId}${n.seconds != null ? `&t=${n.seconds}` : ""}` : null;
                return (
                  <li key={n.id} className="card flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        {href ? (
                          <Link href={href} className="inline-flex items-center gap-1 font-semibold text-sky-600 hover:underline"><Icon name="play" className="size-3" /> {n.lessonTitle}{n.seconds != null && ` · ${fmtSecs(n.seconds)}`}</Link>
                        ) : (
                          <Chip color="gray">Genel not</Chip>
                        )}
                        <span>· {relTime(n.createdAt)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-line text-sm">{n.text}</p>
                    </div>
                    <NoteActions id={n.id} text={n.text} href={href} />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setPage(current - 1)} disabled={current <= 1} className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-navy-800 hover:bg-surface disabled:opacity-40">
              <Icon name="arrowLeft" className="size-4" /> Önceki
            </button>
            <span className="text-sm text-muted">Sayfa {current} / {totalPages}</span>
            <button onClick={() => setPage(current + 1)} disabled={current >= totalPages} className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-navy-800 hover:bg-surface disabled:opacity-40">
              Sonraki <Icon name="arrowRight" className="size-4" />
            </button>
          </div>
        )}
        </>
      )}
    </div>
  );
}
