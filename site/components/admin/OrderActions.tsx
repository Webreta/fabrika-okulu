"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setOrderStatus, updateOrderPeriod } from "@/app/actions/admin";

export function StatusButtons({ orderId, status }: { orderId: number; status: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const go = (s: "paid" | "cancelled" | "refunded" | "pending") => start(async () => { await setOrderStatus(orderId, s); router.refresh(); });
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {status !== "paid" && <button disabled={pending} onClick={() => { if (confirm("Ödeme alındı olarak işaretlenip öğrenci kaydedilsin mi?")) go("paid"); }} className="btn-primary btn-sm">Ödendi işaretle</button>}
      {status === "paid" && <button disabled={pending} onClick={() => { if (confirm("İade edilsin mi? Kurs erişimi kaldırılır.")) go("refunded"); }} className="btn-secondary btn-sm">İade</button>}
      {status !== "cancelled" && <button disabled={pending} onClick={() => { if (confirm("İptal edilsin mi?")) go("cancelled"); }} className="btn-secondary btn-sm text-red-600">İptal</button>}
    </div>
  );
}

export function PeriodSelect({ orderId, courseId, current, periods }: { orderId: number; courseId: number; current: number | null; periods: { id: number; name: string }[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (periods.length === 0) return <span className="text-xs text-muted">—</span>;
  return (
    <select disabled={pending} value={current ?? ""} onChange={(e) => start(async () => { await updateOrderPeriod(orderId, courseId, e.target.value ? Number(e.target.value) : null); router.refresh(); })} className="input w-auto py-1 text-xs">
      <option value="">Dönem seçilmedi</option>
      {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}

