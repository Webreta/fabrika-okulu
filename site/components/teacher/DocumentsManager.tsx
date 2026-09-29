"use client";

import { useFieldId } from "@/components/useFieldId";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueCoupon, deleteDocument, rejectDocument } from "@/app/actions/teacher";
import { fmtDate } from "@/lib/format";
import { Chip } from "@/components/panel/ui";
import { LIMITS, COUPON_MAX_AMOUNT, COUPON_MAX_DAYS } from "@/lib/limits";

type Doc = { id: number; user: string; email: string; fileUrl: string; fileName: string; note: string; status: string; couponCode: string | null; createdAt: string };
type CourseOpt = { id: number; title: string };

/**
 * Kişiye özel kupon formu: belgeye bağlı (docId) ya da e-posta ile doğrudan (emails = otomatik tamamlama listesi).
 * existingCode: belgeye daha önce verilmiş kupon; doluysa yeni kupon eski kuponu iptal eder (onay sorulur).
 * onDone ikinci parametresi işlemin başarılı olup olmadığını bildirir.
 */
export function CouponForm({ courses, docId, emails, existingCode, onDone }: { courses: CourseOpt[]; docId?: number; emails?: string[]; existingCode?: string | null; onDone: (msg: string, ok: boolean) => void }) {
  const fid = useFieldId();
  const [courseId, setCourseId] = useState(0);
  const [type, setType] = useState<"student" | "graduate" | "custom" | "fixed">("student");
  const [fixed, setFixed] = useState(100);
  const [amount, setAmount] = useState(10);
  const [days, setDays] = useState<number | "">("");
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  const submit = () => {
    // Ekranda yakalanabilen hatalar (sunucu aynı kuralları yeniden denetler)
    if (!docId && !email.trim()) return onDone("E-posta gerekli.", false);
    if (type === "custom" && (!Number.isInteger(amount) || amount < 1 || amount > 100)) return onDone("Yüzde 1 ile 100 arasında tam sayı olmalı (ondalık yazılamaz).", false);
    if (type === "fixed" && (!(fixed > 0) || fixed > COUPON_MAX_AMOUNT)) return onDone(`Sabit tutar 0'dan büyük ve en fazla ${COUPON_MAX_AMOUNT.toLocaleString("tr-TR")} TL olmalı.`, false);
    if (days !== "" && (!Number.isInteger(days) || days < 1 || days > COUPON_MAX_DAYS)) return onDone(`Geçerlilik süresi 1 ile ${COUPON_MAX_DAYS} gün arasında tam sayı olmalı (boş = süresiz).`, false);
    if (existingCode && !confirm(`Bu belgeye daha önce ${existingCode} kuponu verildi.\n\nYeni kupon verirsen eski kupon iptal edilir ve öğrenciye yeni kupon bildirilir. Devam edilsin mi?`)) return;
    start(async () => {
      const r = await issueCoupon({ docId, email: email || undefined, courseId, type, amount: type === "fixed" ? fixed : amount, expiryDays: days === "" ? undefined : days, replace: !!existingCode });
      if (r.ok) setEmail("");
      onDone(r.ok ? r.message ?? "Kupon oluşturuldu." : r.error, r.ok);
    });
  };
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      {!docId && (
        <div><label htmlFor={fid("a1")} className="label">E-posta</label>
          <input id={fid("a1")} value={email} onChange={(e) => setEmail(e.target.value)} maxLength={LIMITS.email} className="input" placeholder="ogrenci@mail.com" list={emails ? "coupon-user-emails" : undefined} />
          {emails && <datalist id="coupon-user-emails">{emails.map((m) => <option key={m} value={m} />)}</datalist>}
        </div>
      )}
      <div><label htmlFor={fid("a2")} className="label">Kurs</label>
        <select id={fid("a2")} value={courseId} onChange={(e) => setCourseId(Number(e.target.value))} className="input"><option value={0}>Tüm eğitimler</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
      </div>
      <div><label htmlFor={fid("a3")} className="label">İndirim</label>
        <select id={fid("a3")} value={type} onChange={(e) => setType(e.target.value as typeof type)} className="input"><option value="student">Öğrenci (%90)</option><option value="graduate">Yeni mezun (%50)</option><option value="custom">Özel yüzde</option><option value="fixed">Sabit tutar (₺)</option></select>
      </div>
      {type === "custom" && <div><label htmlFor={fid("a4")} className="label">%</label><input id={fid("a4")} type="number" min={1} max={100} step={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input w-20" /></div>}
      {type === "fixed" && <div><label htmlFor={fid("a5")} className="label">Tutar (₺)</label><input id={fid("a5")} type="number" min={1} max={COUPON_MAX_AMOUNT} step={0.01} value={fixed} onChange={(e) => setFixed(Number(e.target.value))} className="input w-28" /></div>}
      <div><label htmlFor={fid("a6")} className="label">Geçerlilik (gün)</label><input id={fid("a6")} type="number" min={1} max={COUPON_MAX_DAYS} step={1} value={days} onChange={(e) => setDays(e.target.value ? Number(e.target.value) : "")} className="input w-24" placeholder="∞" /></div>
      <button disabled={pending} onClick={submit} className="btn-primary btn-sm">{pending ? "…" : existingCode ? "Kuponu yenile" : "Kupon ver"}</button>
    </div>
  );
}

export function DocumentsManager({ docs, courses }: { docs: Doc[]; courses: CourseOpt[] }) {
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const done = (m: string, ok = true) => { setMsg(m); setErr(!ok); router.refresh(); };
  const reject = (d: Doc) => {
    if (!confirm(`${d.user} kullanıcısının belgesi reddedilsin mi?\n\nÖğrenciye "belgen onaylanmadı" bildirimi gider.`)) return;
    start(async () => { const r = await rejectDocument(d.id); done(r.ok ? r.message ?? "Belge reddedildi." : r.error, r.ok); });
  };
  const remove = (d: Doc) => {
    if (!confirm(`${d.user} kullanıcısının belge kaydı silinsin mi?\n\nBu işlem geri alınamaz.${d.couponCode ? ` Verilmiş kupon (${d.couponCode}) geçerli kalır; iptal etmek için Kuponlar sayfasından sil.` : ""}`)) return;
    start(async () => { const r = await deleteDocument(d.id); done(r.ok ? r.message ?? "Belge silindi." : r.error, r.ok); });
  };
  return (
    <div className="space-y-6">
      {msg && <p role="status" className={`rounded-lg px-4 py-2 text-sm ${err ? "bg-red-50 text-red-700" : "bg-sky-50 text-navy-800"}`}>{msg}</p>}
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
                <td className="max-w-[220px] break-words"><p className="font-semibold text-navy-800">{d.user}</p><p className="text-xs text-muted">{d.email}</p></td>
                <td className="max-w-[220px] break-words"><a href={d.fileUrl} target="_blank" className="text-sky-600 underline">{d.fileName}</a></td>
                <td className="max-w-xs break-words text-xs">{d.note}</td>
                <td className="text-xs">{fmtDate(d.createdAt)}</td>
                <td>{d.status === "coupon_issued" ? <Chip color="green">Kupon: {d.couponCode}</Chip> : d.status === "rejected" ? <Chip color="red">Reddedildi</Chip> : <Chip color="amber">Bekliyor</Chip>}</td>
                <td>
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold text-navy-800">{d.couponCode ? "Kuponu yenile" : "Kupon ver"}</summary>
                    {d.couponCode && <p className="mt-1 max-w-xs text-xs text-muted">Bu belgenin kuponu var ({d.couponCode}). Yenisini verirsen eskisi iptal edilir.</p>}
                    <div className="mt-2"><CouponForm courses={courses} docId={d.id} existingCode={d.couponCode} onDone={done} /></div>
                  </details>
                  <div className="mt-1 flex gap-2 text-xs">
                    {d.status === "pending" && <button disabled={pending} onClick={() => reject(d)} className="text-amber-600 hover:underline">Reddet</button>}
                    <button disabled={pending} onClick={() => remove(d)} className="text-red-600 hover:underline">Sil</button>
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
