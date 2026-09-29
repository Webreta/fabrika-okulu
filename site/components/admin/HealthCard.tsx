"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deactivateRiskyAccount } from "@/app/actions/health";
import type { HealthItem, HealthGroup } from "@/lib/health";
import { Icon } from "@/components/site/Icon";
import { Toast } from "@/components/Toast";

const GROUPS: [HealthGroup, string][] = [
  ["hesap", "Hesaplar"],
  ["sunucu", "Sunucu"],
  ["zamanlayici", "Zamanlayıcı (hatırlatmalar, günlük rapor)"],
  ["eposta", "E-posta"],
];

const LEVEL = {
  ok: { box: "bg-emerald-50 text-emerald-700", icon: "check", label: "Sorun yok" },
  warn: { box: "bg-red-50 text-red-700", icon: "alert", label: "Dikkat" },
  info: { box: "bg-amber-50 text-amber-700", icon: "alert", label: "Bilgi" },
} as const;

/** Sistem sağlığı / güvenlik kontrolü: sunucuda hesaplanan satırları gösterir, riskli hesabı pasifleştirir */
export function HealthCard({ items }: { items: HealthItem[] }) {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  const warns = items.filter((i) => i.level === "warn").length;

  const deactivate = (id: number, title: string) => {
    if (!window.confirm(`${title}\n\nBu hesap pasif yapılsın mı? Hesap silinmez; giriş yapamaz ve açık oturumları kapanır. Kullanıcılar sayfasından yeniden etkinleştirebilirsin.`)) return;
    setBusy(id);
    start(async () => {
      const r = await deactivateRiskyAccount(id);
      setMsg({ text: r.ok ? r.message ?? "Pasif yapıldı." : r.error, ok: r.ok });
      setBusy(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-lg px-4 py-3 text-sm font-semibold ${warns ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
        {warns ? `${warns} konu dikkat gerektiriyor.` : "Dikkat gerektiren bir konu bulunmadı."}
        <span className="block text-xs font-normal opacity-80">Bu sayfa her açıldığında denetim yeniden yapılır. Parolalar hiçbir zaman gösterilmez.</span>
      </div>
      {GROUPS.map(([g, label]) => {
        const list = items.filter((i) => i.group === g);
        if (!list.length) return null;
        return (
          <div key={g} className="card">
            <h2 className="mb-3 font-bold text-navy-800">{label}</h2>
            <ul className="divide-y divide-line">
              {list.map((i) => (
                <li key={i.key} className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${LEVEL[i.level].box}`} title={LEVEL[i.level].label}><Icon name={LEVEL[i.level].icon} className="size-4" /></span>
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="break-words text-sm font-semibold text-navy-800">{i.title}</p>
                    <p className="text-sm text-muted">{i.text}</p>
                    {i.todo && <p className="mt-1 text-sm text-navy-800"><span className="font-semibold">Ne yapmalı:</span> {i.todo}</p>}
                  </div>
                  {i.account?.canDeactivate && (
                    <button disabled={busy !== null} onClick={() => deactivate(i.account!.id, i.title)} className="btn-secondary btn-sm shrink-0">{busy === i.account.id ? "…" : "Pasif yap"}</button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {msg && <Toast message={msg.text} ok={msg.ok} onDone={() => setMsg(null)} />}
    </div>
  );
}
