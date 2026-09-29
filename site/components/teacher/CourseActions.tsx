"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { duplicateCourseAction, deleteCourseAction, toggleCourseClosed } from "@/app/actions/teacher";
import { Icon } from "@/components/site/Icon";

export function CourseActions({ courseId, slug, closed, base = "/egitmen", showDetail = true }: { courseId: number; slug: string; closed: boolean; base?: string; showDetail?: boolean }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<"dup" | "del" | "close" | "open" | null>(null);
  // Sunucunun yanıtı (ör. "kayıtlı öğrenci olduğu için silinmedi") ekranda gösterilir
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  const closeResult = () => { setResult(null); router.refresh(); };
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {showDetail && <Link href={`${base}/detay/${courseId}`} className="btn-secondary btn-sm">Detay</Link>}
      <Link href={`${base}/editor/${courseId}`} className="btn-primary btn-sm"><Icon name="edit" className="size-3.5" /> Düzenle</Link>
      <button onClick={() => setConfirm("dup")} className="btn-secondary btn-sm" title="Çoğalt"><Icon name="copy" className="size-3.5" /></button>
      <Link href={`/program/${slug}`} target="_blank" className="btn-secondary btn-sm" title="Sayfa"><Icon name="eye" className="size-3.5" /></Link>
      <Link href={`/kurs-izle/${courseId}`} target="_blank" className="btn-secondary btn-sm" title="Player"><Icon name="play" className="size-3.5" /></Link>
      <button onClick={() => setConfirm(closed ? "open" : "close")} disabled={pending} className="btn-secondary btn-sm" title={closed ? "Eğitimi aç" : "Eğitimi kapat"} aria-label={closed ? "Eğitimi aç" : "Eğitimi kapat"}><Icon name={closed ? "check" : "lock"} className="size-3.5" /></button>
      <button onClick={() => setConfirm("del")} className="btn-secondary btn-sm text-red-600" title="Sil"><Icon name="trash" className="size-3.5" /></button>
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-navy-800">{confirm === "dup" ? "Eğitimi çoğalt?" : confirm === "del" ? "Eğitimi sil?" : confirm === "close" ? "Eğitimi kapat?" : "Eğitimi yeniden aç?"}</p>
            <p className="mt-1 text-sm text-muted">
              {confirm === "dup" ? "Taslak kopya oluşturulur (dönemler kopyalanmaz)."
                : confirm === "del" ? "Kayıtlı öğrenci varsa silinmez, kapatılıp taslağa alınır."
                : confirm === "close" ? "Eğitim yeni satışa ve kayda kapanır; katalogda ve eğitim sayfasında satın alınamaz. Kayıtlı öğrenciler eğitime erişmeye devam eder."
                : "Eğitim yeniden satışa açılır. Boş yeri olan dönem varsa bekleme listesindekilere haber gider."}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="btn-secondary btn-sm">Vazgeç</button>
              <button disabled={pending} onClick={() => start(async () => {
                if (confirm === "dup") {
                  const r = await duplicateCourseAction(courseId);
                  if (r.ok && r.id) router.push(`${base}/editor/${r.id}`);
                  else setResult({ ok: false, text: r.ok ? "Kopya oluşturulamadı." : r.error });
                } else if (confirm === "close" || confirm === "open") {
                  const r = await toggleCourseClosed(courseId, confirm === "close");
                  if (!r.ok) setResult({ ok: false, text: r.error });
                  else router.refresh();
                } else {
                  const r = await deleteCourseAction(courseId);
                  setResult(r.ok ? { ok: true, text: r.message ?? "Eğitim silindi." } : { ok: false, text: r.error });
                }
                setConfirm(null);
              })} className={`btn-sm ${confirm === "del" ? "btn-danger" : "btn-primary"}`}>{pending ? "…" : "Onayla"}</button>
            </div>
          </div>
        </div>
      )}
      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={closeResult}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" role="alertdialog" onClick={(e) => e.stopPropagation()}>
            <p className={`font-semibold ${result.ok ? "text-navy-800" : "text-red-600"}`}>{result.ok ? "İşlem sonucu" : "İşlem yapılamadı"}</p>
            <p className="mt-1 text-sm text-muted">{result.text}</p>
            <div className="mt-4 flex justify-end"><button onClick={closeResult} className="btn-primary btn-sm">Tamam</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
