"use client";

import { useFieldId } from "@/components/useFieldId";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGeneralCoupon, deleteCoupon } from "@/app/actions/admin";
import { CouponForm } from "@/components/teacher/DocumentsManager";
import { LIMITS, COUPON_MAX_AMOUNT, COUPON_MAX_USAGE, COUPON_MAX_DAYS } from "@/lib/limits";

export function CouponsManager({ courses }: { courses: { id: number; title: string }[] }) {
  const fid = useFieldId();
  const [f, setF] = useState({ code: "", kind: "percent" as "percent" | "amount", percent: 10, amount: 100, courseId: 0, usageLimit: 0, expiryDays: 0 });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const say = (m: string, ok: boolean) => { setMsg(m); setErr(!ok); };
  const submit = () => {
    // Ekranda yakalanabilen hatalar (sunucu aynı kuralları yeniden denetler)
    if (!f.code.trim()) return say("Kupon kodu gerekli.", false);
    if (f.kind === "percent" && (!Number.isInteger(f.percent) || f.percent < 1 || f.percent > 100)) return say("Yüzde 1 ile 100 arasında tam sayı olmalı (ondalık yazılamaz; örneğin 12.5 yerine 12 ya da 13).", false);
    if (f.kind === "amount" && (!(f.amount > 0) || f.amount > COUPON_MAX_AMOUNT)) return say(`Sabit tutar 0'dan büyük ve en fazla ${COUPON_MAX_AMOUNT.toLocaleString("tr-TR")} TL olmalı.`, false);
    if (!Number.isInteger(f.usageLimit) || f.usageLimit < 0 || f.usageLimit > COUPON_MAX_USAGE) return say("Kullanım limiti 0 ya da daha büyük bir tam sayı olmalı (0 = sınırsız).", false);
    if (!Number.isInteger(f.expiryDays) || f.expiryDays < 0 || f.expiryDays > COUPON_MAX_DAYS) return say(`Geçerlilik süresi 0 ile ${COUPON_MAX_DAYS} gün arasında tam sayı olmalı (0 = süresiz).`, false);
    start(async () => {
      const r = await createGeneralCoupon({ ...f, expiryDays: f.expiryDays || undefined });
      say(r.ok ? r.message ?? "Tamam" : r.error, r.ok);
      if (r.ok) { setF({ ...f, code: "" }); router.refresh(); }
    });
  };
  return (
    <div className="card flex flex-wrap items-end gap-3">
      <div><label htmlFor={fid("a1")} className="label">Kod</label><input id={fid("a1")} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} maxLength={LIMITS.couponCode} className="input w-36 uppercase" placeholder="YAZ2026" /></div>
      <div><label htmlFor={fid("a2")} className="label">İndirim türü</label><select id={fid("a2")} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as typeof f.kind })} className="input"><option value="percent">Yüzde (%)</option><option value="amount">Sabit tutar (₺)</option></select></div>
      {f.kind === "percent"
        ? <div><label htmlFor={fid("a3")} className="label">%</label><input id={fid("a3")} type="number" min={1} max={100} step={1} value={f.percent} onChange={(e) => setF({ ...f, percent: Number(e.target.value) })} className="input w-20" /></div>
        : <div><label htmlFor={fid("a4")} className="label">Tutar (₺)</label><input id={fid("a4")} type="number" min={1} max={COUPON_MAX_AMOUNT} step={0.01} value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} className="input w-28" /></div>}
      <div><label htmlFor={fid("a5")} className="label">Kurs</label><select id={fid("a5")} value={f.courseId} onChange={(e) => setF({ ...f, courseId: Number(e.target.value) })} className="input"><option value={0}>Tüm eğitimler</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
      <div><label htmlFor={fid("a6")} className="label">Kullanım limiti</label><input id={fid("a6")} type="number" min={0} max={COUPON_MAX_USAGE} step={1} value={f.usageLimit} onChange={(e) => setF({ ...f, usageLimit: Number(e.target.value) })} className="input w-24" placeholder="0 = ∞" /></div>
      <div><label htmlFor={fid("a7")} className="label">Geçerlilik (gün)</label><input id={fid("a7")} type="number" min={0} max={COUPON_MAX_DAYS} step={1} value={f.expiryDays} onChange={(e) => setF({ ...f, expiryDays: Number(e.target.value) })} className="input w-24" placeholder="0 = ∞" /></div>
      <button disabled={pending} onClick={submit} className="btn-primary">{pending ? "…" : "Oluştur"}</button>
      {msg && <p role="status" className={`w-full text-sm ${err ? "font-semibold text-red-600" : "text-navy-800"}`}>{msg}</p>}
    </div>
  );
}

export function DeleteCouponButton({ id }: { id: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button disabled={pending} onClick={() => { if (confirm("Kupon silinsin mi?")) start(async () => { await deleteCoupon(id); router.refresh(); }); }} className="text-sm text-red-600 hover:underline">Sil</button>;
}

/** Kişiye özel kupon: yönetici bir kullanıcıya belge olmadan doğrudan indirim tanımlar (öğrencide "Hesabıma tanımlanan kuponlar") */
export function PersonalCouponCard({ courses, emails }: { courses: { id: number; title: string }[]; emails: string[] }) {
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(false);
  const router = useRouter();
  return (
    <div className="card">
      <h2 className="font-bold text-navy-800">Kişiye özel kupon tanımla</h2>
      <p className="mb-3 text-xs text-muted">Kupon yalnızca bu kullanıcının hesabında geçerli olur; öğrenciye bildirim ve e-posta gider.</p>
      <CouponForm courses={courses} emails={emails} onDone={(m, ok) => { setMsg(m); setErr(!ok); if (ok) router.refresh(); }} />
      {msg && <p role="status" className={`mt-2 text-sm ${err ? "font-semibold text-red-600" : "text-navy-800"}`}>{msg}</p>}
    </div>
  );
}
