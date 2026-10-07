"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreCourse, purgeCourse } from "@/app/actions/admin";
import { Icon } from "@/components/site/Icon";

/** Arşivdeki eğitim için "Geri al" ve "Kalıcı sil" düğmeleri (onay penceresiyle) */
export function ArchiveActions({ courseId, title }: { courseId: number; title: string }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<"restore" | "purge" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={() => setConfirm("restore")} disabled={pending} className="btn-primary btn-sm"><Icon name="check" className="size-3.5" /> Geri al</button>
      <button onClick={() => setConfirm("purge")} disabled={pending} className="btn-secondary btn-sm text-red-600"><Icon name="trash" className="size-3.5" /> Kalıcı sil</button>
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" role="alertdialog" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-navy-800">{confirm === "restore" ? "Eğitimi geri al?" : "Eğitimi kalıcı olarak sil?"}</p>
            <p className="mt-1 text-sm text-muted">
              {confirm === "restore"
                ? `"${title}" taslak olarak Kurslar listesine döner; yayına almak için editörden kaydedilir.`
                : `"${title}" ile birlikte modülleri, dersleri, dönemleri ve sınavları silinir. Bu işlem geri alınamaz.`}
            </p>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setConfirm(null); setError(null); }} className="btn-secondary btn-sm">Vazgeç</button>
              <button disabled={pending} onClick={() => start(async () => {
                const r = confirm === "restore" ? await restoreCourse(courseId) : await purgeCourse(courseId);
                if (!r.ok) { setError(r.error); return; }
                setConfirm(null);
                router.refresh();
              })} className={`btn-sm ${confirm === "purge" ? "btn-danger" : "btn-primary"}`}>{pending ? "…" : "Onayla"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
