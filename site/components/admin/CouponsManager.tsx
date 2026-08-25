"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGeneralCoupon, deleteCoupon } from "@/app/actions/admin";

export function CouponsManager({ courses }: { courses: { id: number; title: string }[] }) {
  const [f, setF] = useState({ code: "", percent: 10, courseId: 0, usageLimit: 0, expiryDays: 0 });
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="card flex flex-wrap items-end gap-3">
      <div><label className="label">Kod</label><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} className="input w-36 uppercase" placeholder="YAZ2026" /></div>
      <div><label className="label">%</label><input type="number" min={1} max={100} value={f.percent} onChange={(e) => setF({ ...f, percent: Number(e.target.value) })} className="input w-20" /></div>
      <div><label className="label">Kurs</label><select value={f.courseId} onChange={(e) => setF({ ...f, courseId: Number(e.target.value) })} className="input"><option value={0}>Tüm eğitimler</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
      <div><label className="label">Kullanım limiti</label><input type="number" min={0} value={f.usageLimit} onChange={(e) => setF({ ...f, usageLimit: Number(e.target.value) })} className="input w-24" placeholder="0 = ∞" /></div>
      <div><label className="label">Geçerlilik (gün)</label><input type="number" min={0} value={f.expiryDays} onChange={(e) => setF({ ...f, expiryDays: Number(e.target.value) })} className="input w-24" /></div>
      <button disabled={pending} onClick={() => start(async () => { const r = await createGeneralCoupon({ ...f, expiryDays: f.expiryDays || undefined }); setMsg(r.ok ? r.message ?? "Tamam" : r.error); router.refresh(); })} className="btn-primary">Oluştur</button>
      {msg && <span className="text-sm text-navy-800">{msg}</span>}
    </div>
  );
}

export function DeleteCouponButton({ id }: { id: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button disabled={pending} onClick={() => { if (confirm("Kupon silinsin mi?")) start(async () => { await deleteCoupon(id); router.refresh(); }); }} className="text-sm text-red-600 hover:underline">Sil</button>;
}
