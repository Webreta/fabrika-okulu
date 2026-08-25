"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueCertificate, revokeCertificate } from "@/app/actions/teacher";
import { Icon } from "@/components/site/Icon";

export function IssueCertButton({ userId, courseId, eligible }: { userId: number; courseId: number; eligible: { id: number; title: string }[] }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(eligible[0]?.id ?? 0);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  if (eligible.length === 0) return null;
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary btn-sm"><Icon name="award" className="size-3.5" /> Sertifika tanımla</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/60 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold text-navy-800">Hangi sertifika?</p>
            <div className="mt-3 space-y-2">
              {eligible.map((t) => (
                <label key={t.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${sel === t.id ? "border-sky-400 bg-sky-50" : "border-line"}`}>
                  <input type="radio" checked={sel === t.id} onChange={() => setSel(t.id)} /> {t.title}
                </label>
              ))}
            </div>
            {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="btn-secondary btn-sm">Vazgeç</button>
              <button disabled={pending} onClick={() => start(async () => { const r = await issueCertificate(sel, userId, courseId); if (!r.ok) setErr(r.error); else { setOpen(false); router.refresh(); } })} className="btn-primary btn-sm">{pending ? "…" : "Ver"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function RevokeCertButton({ id }: { id: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button disabled={pending} onClick={() => { if (confirm("Sertifika iptal edilsin mi? Bağlantı çalışmaz hale gelir.")) start(async () => { await revokeCertificate(id); router.refresh(); }); }} className="text-red-600 hover:underline" title="İptal et">×</button>
  );
}
