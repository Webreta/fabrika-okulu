"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminEnroll, adminUnenroll, adminUnenrollAll } from "@/app/actions/admin";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Chip } from "@/components/panel/ui";

type E = { courseId: number; title: string; enrolledAt: string; orderId: number | null; status: string; startedAt: string | null };

export function StudentDetail({ userId, enrollments, courses }: { userId: number; enrollments: E[]; courses: { id: number; title: string }[] }) {
  const [sel, setSel] = useState(courses[0]?.id ?? 0);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => { const r = await fn(); setMsg(r.ok ? r.message ?? "Tamam" : r.error ?? "Hata"); router.refresh(); });
  return (
    <div className="space-y-5">
      {msg && <p className="rounded-lg bg-sky-50 px-4 py-2 text-sm">{msg}</p>}
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Eğitim</th><th>Kayıt</th><th>Başladı</th><th>Kaynak</th><th></th></tr></thead>
          <tbody>
            {enrollments.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted">Kayıtlı eğitim yok.</td></tr>}
            {enrollments.map((e) => (
              <tr key={e.courseId}>
                <td className="font-semibold text-navy-800">{e.title} {e.status !== "active" && <Chip color="gray">{e.status}</Chip>}</td>
                <td className="text-xs">{fmtDate(e.enrolledAt)}</td>
                <td className="text-xs">{e.startedAt ? fmtDateTime(e.startedAt) : "—"}</td>
                <td className="text-xs">{e.orderId ? `Sipariş #${e.orderId}` : "Ücretsiz / elle"}</td>
                <td><button disabled={pending} onClick={() => { if (confirm("Eğitimden çıkarılsın mı?")) run(() => adminUnenroll(userId, e.courseId)); }} className="text-sm text-red-600 hover:underline">Çıkar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card flex flex-wrap items-end gap-2">
        <div className="flex-1"><label className="label">Eğitime ekle</label>
          <select value={sel} onChange={(e) => setSel(Number(e.target.value))} className="input">{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
        </div>
        <button disabled={pending || !sel} onClick={() => run(() => adminEnroll(userId, sel))} className="btn-primary">Ekle</button>
      </div>
      {enrollments.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">Tehlikeli bölge</p>
          <button disabled={pending} onClick={() => { if (confirm("Tüm eğitim kayıtları silinecek. Emin misin?")) run(() => adminUnenrollAll(userId)); }} className="btn-danger btn-sm mt-2">Tüm eğitimlerden çıkar</button>
        </div>
      )}
    </div>
  );
}
