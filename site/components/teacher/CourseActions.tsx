"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { duplicateCourseAction, deleteCourseAction, toggleCourseClosed } from "@/app/actions/teacher";
import { Icon } from "@/components/site/Icon";

export function CourseActions({ courseId, slug, closed, base = "/egitmen", showDetail = true }: { courseId: number; slug: string; closed: boolean; base?: string; showDetail?: boolean }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<"dup" | "del" | null>(null);
  const router = useRouter();
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {showDetail && <Link href={`${base}/detay/${courseId}`} className="btn-secondary btn-sm">Detay</Link>}
      <Link href={`${base}/editor/${courseId}`} className="btn-primary btn-sm"><Icon name="edit" className="size-3.5" /> Düzenle</Link>
      <button onClick={() => setConfirm("dup")} className="btn-secondary btn-sm" title="Çoğalt"><Icon name="copy" className="size-3.5" /></button>
      <Link href={`/program/${slug}`} target="_blank" className="btn-secondary btn-sm" title="Sayfa"><Icon name="eye" className="size-3.5" /></Link>
      <Link href={`/kurs-izle/${courseId}`} target="_blank" className="btn-secondary btn-sm" title="Player"><Icon name="play" className="size-3.5" /></Link>
      <button onClick={() => start(async () => { await toggleCourseClosed(courseId, !closed); router.refresh(); })} disabled={pending} className="btn-secondary btn-sm" title={closed ? "Eğitimi aç" : "Eğitimi kapat"}><Icon name={closed ? "check" : "lock"} className="size-3.5" /></button>
      <button onClick={() => setConfirm("del")} className="btn-secondary btn-sm text-red-600" title="Sil"><Icon name="trash" className="size-3.5" /></button>
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-navy-800">{confirm === "dup" ? "Eğitimi çoğalt?" : "Eğitimi sil?"}</p>
            <p className="mt-1 text-sm text-muted">{confirm === "dup" ? "Taslak kopya oluşturulur (dönemler kopyalanmaz)." : "Kayıtlı öğrenci varsa silinmez, kapatılıp taslağa alınır."}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="btn-secondary btn-sm">Vazgeç</button>
              <button disabled={pending} onClick={() => start(async () => {
                if (confirm === "dup") { const r = await duplicateCourseAction(courseId); if (r.ok && r.id) router.push(`${base}/editor/${r.id}`); }
                else { await deleteCourseAction(courseId); router.refresh(); }
                setConfirm(null);
              })} className={`btn-sm ${confirm === "del" ? "btn-danger" : "btn-primary"}`}>{pending ? "…" : "Onayla"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
