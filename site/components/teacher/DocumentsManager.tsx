"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueCoupon, deleteDocument, rejectDocument } from "@/app/actions/teacher";
import { fmtDate } from "@/lib/format";
import { Chip } from "@/components/panel/ui";

type Doc = { id: number; user: string; email: string; fileUrl: string; fileName: string; note: string; status: string; couponCode: string | null; createdAt: string };
type CourseOpt = { id: number; title: string };

function CouponForm({ courses, docId, onDone }: { courses: CourseOpt[]; docId?: number; onDone: (msg: string) => void }) {
  const [courseId, setCourseId] = useState(0);
  const [type, setType] = useState<"student" | "graduate" | "custom">("student");
  const [amount, setAmount] = useState(10);
  const [days, setDays] = useState<number | "">("");
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      {!docId && <div><label className="label">E-posta</label><input value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="ogrenci@mail.com" /></div>}
      <div><label className="label">Kurs</label>
        <select value={courseId} onChange={(e) => setCourseId(Number(e.target.value))} className="input"><option value={0}>Tüm eğitimler</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
      </div>
      <div><label className="label">İndirim</label>
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="input"><option value="student">Öğrenci (%90)</option><option value="graduate">Yeni mezun (%50)</option><option value="custom">Özel</option></select>
      </div>
      {type === "custom" && <div><label className="label">%</label><input type="number" min={1} max={100} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input w-20" /></div>}
      <div><label className="label">Geçerlilik (gün)</label><input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value ? Number(e.target.value) : "")} className="input w-24" placeholder="∞" /></div>
      <button disabled={pending} onClick={() => start(async () => { const r = await issueCoupon({ docId, email: email || undefined, courseId, type, amount, expiryDays: days || undefined }); onDone(r.ok ? r.message ?? "Kupon oluşturuldu." : r.error); })} className="btn-primary btn-sm">{pending ? "…" : "Kupon ver"}</button>
    </div>
  );
}

export function DocumentsManager({ docs, courses }: { docs: Doc[]; courses: CourseOpt[] }) {
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const done = (m: string) => { setMsg(m); router.refresh(); };
  return (
    <div className="space-y-6">
      {msg && <p className="rounded-lg bg-sky-50 px-4 py-2 text-sm text-navy-800">{msg}</p>}
      <div className="card">
        <h2 className="font-bold text-navy-800">Doğrudan kupon tanımla</h2>
        <p className="mb-3 text-xs text-muted">Belge olmadan bir kullanıcıya kupon ver.</p>
        <CouponForm courses={courses} onDone={done} />
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Kullanıcı</th><th>Belge</th><th>Not</th><th>Tarih</th><th>Durum</th><th>İşlem</th></tr></thead>
          <tbody>
            {docs.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted">Belge yok.</td></tr>}
            {docs.map((d) => (
              <tr key={d.id}>
                <td><p className="font-semibold text-navy-800">{d.user}</p><p className="text-xs text-muted">{d.email}</p></td>
                <td><a href={d.fileUrl} target="_blank" className="text-sky-600 underline">{d.fileName}</a></td>
                <td className="max-w-xs text-xs">{d.note}</td>
                <td className="text-xs">{fmtDate(d.createdAt)}</td>
                <td>{d.status === "coupon_issued" ? <Chip color="green">Kupon: {d.couponCode}</Chip> : d.status === "rejected" ? <Chip color="red">Reddedildi</Chip> : <Chip color="amber">Bekliyor</Chip>}</td>
                <td>
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold text-navy-800">Kupon ver</summary>
                    <div className="mt-2"><CouponForm courses={courses} docId={d.id} onDone={done} /></div>
                  </details>
                  <div className="mt-1 flex gap-2 text-xs">
                    {d.status === "pending" && <button disabled={pending} onClick={() => start(async () => { await rejectDocument(d.id); router.refresh(); })} className="text-amber-600 hover:underline">Reddet</button>}
                    <button disabled={pending} onClick={() => start(async () => { await deleteDocument(d.id); router.refresh(); })} className="text-red-600 hover:underline">Sil</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
