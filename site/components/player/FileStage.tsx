"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Icon } from "@/components/site/Icon";

/** Korumalı dosya görüntüleyici: indirme/kopyalama arayüzü yok, filigran var. Dosya /api/dosya/{id} ile akıtılır. */
export function FileStage({ lesson, nextUrl, prevUrl }: { lesson: { id: number; title: string; fileName: string; mime: string }; nextUrl: string | null; prevUrl: string | null }) {
  const src = `/api/dosya/${lesson.id}`;
  const isPdf = lesson.mime === "application/pdf" || lesson.fileName.toLowerCase().endsWith(".pdf");

  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && ["s", "p"].includes(e.key.toLowerCase())) e.preventDefault(); };
    document.addEventListener("contextmenu", block);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("contextmenu", block); document.removeEventListener("keydown", key); };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="badge bg-violet-100 text-violet-700">DOSYA</span>
          <h1 className="mt-1 text-xl font-bold text-navy-800">{lesson.title}</h1>
        </div>
        <div className="flex gap-2">
          {prevUrl && <Link href={prevUrl} className="btn-secondary btn-sm"><Icon name="arrowLeft" className="size-4" /> Önceki</Link>}
          {nextUrl && <Link href={nextUrl} className="btn-primary btn-sm">Sonraki <Icon name="arrowRight" className="size-4" /></Link>}
        </div>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-line bg-white select-none">
        {isPdf ? (
          <iframe src={`${src}#toolbar=0&navpanes=0&scrollbar=1`} className="h-[78vh] w-full" title={lesson.title} />
        ) : (
          <img src={src} alt={lesson.title} className="mx-auto max-h-[78vh] w-auto" draggable={false} />
        )}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 place-items-center opacity-[0.07]">
          {Array.from({ length: 9 }).map((_, i) => <span key={i} className="-rotate-12 text-2xl font-bold text-navy-800">Fabrika Okulu</span>)}
        </div>
      </div>
      <p className="text-center text-xs text-muted">Bu dosya indirilemez ve kopyalanamaz · ilerlemeni etkilemez</p>
    </div>
  );
}
