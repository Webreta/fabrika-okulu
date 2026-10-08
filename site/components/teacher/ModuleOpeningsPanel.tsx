"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/site/Icon";
import { Chip } from "@/components/panel/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { openModuleNowAction, setModuleOpeningAction } from "@/app/actions/module-openings";

type Mod = { id: number; title: string; mode: "manual" | "scheduled"; label: string };
type Per = { id: number; name: string; startDate: string; endDate: string; enrolled: number; past: boolean };
type Cell = { periodId: number; moduleId: number; opensAt: string | null; open: boolean; override: string | null; notifiedAt: string | null; lateTasks: string[] };

/**
 * Kurs detayı → "Modül Açılışları": dönem × modül tablosu. Yönetici "Şimdi aç", "Tarih belirle", "Geri al" yapar;
 * eğitmen yalnızca görür. Esnek (dönemsiz) kursta yalnızca kural listesi gösterilir (taban öğrencinin başlangıcı).
 */
export function ModuleOpeningsPanel({ isAdmin, hasPeriods, modules, periods, cells, editorHref }: {
  isAdmin: boolean; hasPeriods: boolean; modules: Mod[]; periods: Per[]; cells: Cell[]; editorHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [dateKey, setDateKey] = useState<string | null>(null);
  const [dateVal, setDateVal] = useState("");

  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message ?? "Kaydedildi." } : { ok: false, text: r.error });
      setConfirmKey(null); setDateKey(null);
      if (r.ok) router.refresh();
    });

  if (modules.length === 0) {
    return (
      <div className="card text-sm text-muted">
        <p>Bu eğitimde açılışı kısıtlanmış modül yok; tüm modüller sıralı ders kilidiyle hemen açılır.</p>
        {isAdmin && <p className="mt-2">Kısıtlamak için <Link href={editorHref} className="font-semibold text-navy-800 underline">editörde</Link> modül kartındaki <b>Açılış</b> alanından “Yönetici açınca” ya da “Zamanlı” seç.</p>}
      </div>
    );
  }

  if (!hasPeriods) {
    return (
      <div className="card">
        <p className="text-sm text-muted">Esnek eğitimde modüller her öğrenci için kendi başlangıcına göre açılır; dönem olmadığından elle açma yoktur.</p>
        <ul className="mt-3 divide-y divide-line">
          {modules.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span className="font-semibold text-navy-800">{m.title}</span><Chip color="sky">{m.label}</Chip></li>
          ))}
        </ul>
        {isAdmin && <p className="mt-3 text-xs text-muted">Kuralı <Link href={editorHref} className="font-semibold text-navy-800 underline">editörden</Link> değiştirebilirsin.</p>}
      </div>
    );
  }

  const cellOf = (pid: number, mid: number) => cells.find((c) => c.periodId === pid && c.moduleId === mid);
  // datetime-local yerel saat ister (ISO metni UTC'dir)
  const toLocalInput = (iso: string) => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  return (
    <div className="space-y-3">
      <div className="card text-sm text-muted">
        <p><Icon name="lock" className="mr-1 inline size-4 text-amber-500" /> Açılış dönem bazındadır: aynı modül her dönem için ayrı açılır. <b>Yönetici açınca</b> modülde “Şimdi aç” ya da ileri bir tarih belirlenir; <b>Zamanlı</b> modülde dönem başlangıcına göre hesaplanan tarih, istenirse o dönem için değiştirilir. Açılınca dönemin öğrencilerine bildirim ve e-posta gider.</p>
      </div>
      {msg && <p className={`rounded-lg px-4 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Modül</th>
              {periods.map((p) => <th key={p.id} className="min-w-56"><p>{p.name}</p><p className="text-[11px] font-normal text-muted">{fmtDate(p.startDate)} – {fmtDate(p.endDate)} · {p.enrolled} kayıtlı{p.past ? " · bitti" : ""}</p></th>)}
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <tr key={m.id} className="align-top">
                <td className="min-w-48"><p className="font-semibold text-navy-800">{m.title}</p><p className="text-xs text-muted">{m.label}</p></td>
                {periods.map((p) => {
                  const c = cellOf(p.id, m.id);
                  const key = `${p.id}-${m.id}`;
                  if (!c) return <td key={p.id} />;
                  return (
                    <td key={p.id} className="text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {c.open ? <Chip color="green">Açık</Chip> : <Chip color="amber">Kapalı</Chip>}
                        {c.opensAt ? <span className="text-muted">{c.open ? "Açıldı: " : "Açılacak: "}{fmtDateTime(c.opensAt)}</span> : <span className="text-muted">{m.mode === "manual" ? "Henüz açılmadı" : "Tarih hesaplanamadı"}</span>}
                        {c.override && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">{m.mode === "manual" ? "elle" : "döneme özel tarih"}</span>}
                        {c.notifiedAt && <span className="text-[10px] text-muted">haber verildi</span>}
                      </div>
                      {c.lateTasks.length > 0 && <p className="mt-1 text-[11px] font-semibold text-red-600">Teslimi açılıştan önce biten: {c.lateTasks.join(", ")}</p>}
                      {isAdmin && !p.past && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {!c.open && (confirmKey === key ? (
                            <>
                              <button disabled={pending} onClick={() => run(() => openModuleNowAction(m.id, p.id))} className="btn-primary btn-sm">Onayla · {p.enrolled} öğrenciye haber gider</button>
                              <button disabled={pending} onClick={() => setConfirmKey(null)} className="btn-secondary btn-sm">Vazgeç</button>
                            </>
                          ) : (
                            <button disabled={pending} onClick={() => { setConfirmKey(key); setDateKey(null); }} className="btn-primary btn-sm">Şimdi aç</button>
                          ))}
                          {dateKey === key ? (
                            <span className="flex flex-wrap items-center gap-1.5">
                              <input aria-label="Açılış tarihi ve saati" type="datetime-local" value={dateVal} onChange={(e) => setDateVal(e.target.value)} className="input w-auto py-1 text-xs" />
                              <button disabled={pending || !dateVal} onClick={() => run(() => setModuleOpeningAction(m.id, p.id, dateVal))} className="btn-primary btn-sm">Kaydet</button>
                              <button disabled={pending} onClick={() => setDateKey(null)} className="btn-secondary btn-sm">Vazgeç</button>
                            </span>
                          ) : (
                            <button disabled={pending} onClick={() => { setDateKey(key); setConfirmKey(null); setDateVal(c.override ? toLocalInput(c.override) : ""); }} className="btn-secondary btn-sm">{c.override ? "Tarihi değiştir" : "Tarih belirle"}</button>
                          )}
                          {c.override && <button disabled={pending} onClick={() => run(() => setModuleOpeningAction(m.id, p.id, null))} className="btn-secondary btn-sm text-red-600">{m.mode === "manual" ? "Geri al (kapat)" : "Göreli kurala dön"}</button>}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isAdmin && <p className="text-xs text-muted">Modülün açılış kuralı (hemen / yönetici / zamanlı, gün ve saat) <Link href={editorHref} className="font-semibold text-navy-800 underline">editörde</Link> değiştirilir.</p>}
    </div>
  );
}
