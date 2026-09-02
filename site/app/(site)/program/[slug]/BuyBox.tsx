"use client";

import { useMemo, useState } from "react";
import { addToCart } from "@/app/actions/cart";
import { Icon } from "@/components/site/Icon";
import { addMinutes, fmtDayShort } from "@/lib/meeting";
import { Modal } from "@/components/site/Modal";

type P = { id: number; name: string; range: string; left: number; full: boolean; schedule: number; date?: string; time?: string; sessions?: string[] };

export function BuyBox({
  courseId, isFree, periodBased, periods, buttonType, whatsappUrl, meeting = false, minutes = 0,
}: { courseId: number; isFree: boolean; periodBased: boolean; periods: P[]; buttonType: string; whatsappUrl: string; meeting?: boolean; minutes?: number }) {
  // Görüşmede koltuk elle seçilir (ön seçim yok); dönemde ilk boş dönem ön seçilidir
  const [periodId, setPeriodId] = useState<number | null>(meeting ? null : periods.find((p) => !p.full)?.id ?? null);
  const [open, setOpen] = useState(false);
  const sel = periods.find((p) => p.id === periodId);
  const showCart = buttonType !== "whatsapp";
  const showWa = (buttonType === "whatsapp" || buttonType === "both") && !!whatsappUrl;

  return (
    <div className="mt-4 space-y-3">
      {periodBased && meeting && (
        <div>
          <p className="label">Görüşme saati</p>
          {periods.length === 0 ? (
            <p className="rounded-lg bg-surface p-3 text-sm text-muted">Açık görüşme saati yok.</p>
          ) : (
            <button type="button" onClick={() => setOpen(true)} className="input flex items-center justify-between text-left">
              <span className={sel ? "" : "text-muted"}>{sel && sel.date && sel.time ? `${fmtDayShort(sel.date)} · ${sel.time}${minutes ? `-${addMinutes(sel.time, minutes)}` : ""}` : "Gün ve koltuk seç"}</span>
              <Icon name="calendar" className="size-4 text-muted" />
            </button>
          )}
          {sel && sel.sessions && sel.sessions.length > 1 && (
            <p className="mt-1 text-[11px] leading-snug text-muted">{sel.sessions.length} görüşme: {sel.sessions.map((d) => fmtDayShort(d)).join(" · ")}{minutes ? ` · her görüşme ${minutes} dk` : ""}</p>
          )}
          <Modal open={open} onClose={() => setOpen(false)} className="max-w-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-navy-800">Görüşme Saati Seçin</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Kapat"><Icon name="x" className="size-5" /></button>
            </div>
            <div className="mt-4">
              <SeatPicker periods={periods} minutes={minutes} selected={periodId} onSelect={setPeriodId} />
            </div>
            <button type="button" disabled={!periodId} onClick={() => setOpen(false)} className="btn-primary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-60">
              <Icon name="check" className="size-4" /> {periodId ? "Bu koltuğu seç" : "Bir koltuk seç"}
            </button>
          </Modal>
        </div>
      )}
      {periodBased && !meeting && (
        <div>
          <p className="label">Dönem</p>
          {periods.length === 0 ? (
            <p className="rounded-lg bg-surface p-3 text-sm text-muted">Kayıt açık dönem yok.</p>
          ) : (
            <button type="button" onClick={() => setOpen(true)} className="input flex items-center justify-between text-left">
              <span>{sel ? `${sel.name} · ${sel.range}` : "Seçiniz"}</span>
              <Icon name="chevronDown" className="size-4 text-muted" />
            </button>
          )}
          <Modal open={open} onClose={() => setOpen(false)}>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-navy-800">Dönem Seçin</h3>
                  <button onClick={() => setOpen(false)} aria-label="Kapat"><Icon name="x" className="size-5" /></button>
                </div>
                <div className="mt-4 space-y-2">
                  {periods.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={p.full}
                      onClick={() => { setPeriodId(p.id); setOpen(false); }}
                      className={`w-full rounded-xl border p-3 text-left transition ${p.id === periodId ? "border-sky-400 bg-sky-50" : "border-line hover:bg-surface"} disabled:opacity-50`}
                    >
                      <p className="font-semibold text-navy-800">{p.name}</p>
                      <p className="text-sm text-muted">{p.range}</p>
                      <p className="mt-1 text-xs text-muted">
                        {p.full ? "Kontenjan dolu" : `${p.left} kişilik yer var`}{p.schedule > 0 && ` · 📋 ${p.schedule} oturum`}
                      </p>
                    </button>
                  ))}
                </div>
          </Modal>
        </div>
      )}
      {showCart && (
        <form action={addToCart}>
          <input type="hidden" name="courseId" value={courseId} />
          {periodId && <input type="hidden" name="periodId" value={periodId} />}
          <button disabled={periodBased && !periodId} className="btn-primary w-full py-3 disabled:cursor-not-allowed disabled:opacity-60">
            <Icon name={isFree ? "library" : "cart"} className="size-4" /> {meeting && !periodId ? "Önce bir koltuk seç" : isFree ? "Kitaplığa Ekle" : "Hemen Kayıt Ol"}
          </button>
        </form>
      )}
      {showWa && (
        <a href={whatsappUrl} target="_blank" rel="noopener" className="btn w-full bg-emerald-500 py-3 text-white hover:bg-emerald-600">
          <Icon name="whatsapp" className="size-4" /> WhatsApp ile Sor
        </a>
      )}
    </div>
  );
}

/**
 * Sinema salonu mantığı: önce gün, sonra koltuk (kişi ikonu). Yeşil boş, turuncu dolu, lacivert seçili.
 * Boş koltuğa tıklayınca tarih-saat (ve haftalık danışmanlıkta tüm görüşme tarihleri) gösterilir.
 */
function SeatPicker({ periods, minutes, selected, onSelect }: { periods: P[]; minutes: number; selected: number | null; onSelect: (id: number) => void }) {
  const days = useMemo(() => {
    const m = new Map<string, P[]>();
    for (const p of periods) { if (!p.date) continue; m.set(p.date, [...(m.get(p.date) ?? []), p]); }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({ date, list: list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")), free: list.filter((p) => !p.full).length }));
  }, [periods]);
  const [day, setDay] = useState<string | null>(days.find((d) => d.free > 0)?.date ?? days[0]?.date ?? null);
  const cur = days.find((d) => d.date === day);
  const sel = periods.find((p) => p.id === selected);

  if (days.length === 0) return <p className="rounded-lg bg-surface p-3 text-sm text-muted">Açık görüşme saati yok.</p>;

  return (
    <div className="space-y-3">
      <div>
        <p className="label">1. Gün seç</p>
        <div className="flex flex-wrap gap-2">
          {days.map((d) => (
            <button key={d.date} type="button" onClick={() => setDay(d.date)} className={`rounded-xl border-2 px-3 py-1.5 text-left text-sm transition ${d.date === day ? "border-navy-800 bg-navy-800 text-white" : "border-line bg-white text-navy-800 hover:border-navy-300"}`}>
              <span className="block font-semibold">{fmtDayShort(d.date)}</span>
              <span className={`block text-[11px] ${d.date === day ? "text-white/80" : d.free ? "text-emerald-600" : "text-orange-600"}`}>{d.free ? `${d.free} boş koltuk` : "Dolu"}</span>
            </button>
          ))}
        </div>
      </div>
      {cur && (
        <div>
          <p className="label">2. Koltuk seç</p>
          <div className="rounded-xl bg-surface p-3">
            <div className="grid grid-cols-10 gap-x-1 gap-y-2">
              {cur.list.map((p) => {
                const isSel = p.id === selected;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={p.full}
                    onClick={() => onSelect(p.id)}
                    title={p.full ? "Dolu" : p.name}
                    className={`flex flex-col items-center gap-0.5 rounded-lg py-1 transition ${p.full ? "cursor-not-allowed" : "hover:scale-110"}`}
                  >
                    <span className={`flex size-8 items-center justify-center rounded-t-lg rounded-b border-b-4 ${isSel ? "border-navy-900 bg-navy-800 text-white" : p.full ? "border-orange-400 bg-orange-100 text-orange-600" : "border-emerald-500 bg-emerald-100 text-emerald-700"}`}>
                      <Icon name="user" className="size-3.5" />
                    </span>
                    <span className={`text-[10px] font-semibold ${isSel ? "text-navy-800" : p.full ? "text-orange-600" : "text-emerald-700"}`}>{p.time}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted">
              <span className="flex items-center gap-1"><span className="size-3 rounded-sm bg-emerald-400" /> Boş</span>
              <span className="flex items-center gap-1"><span className="size-3 rounded-sm bg-orange-400" /> Dolu</span>
              <span className="flex items-center gap-1"><span className="size-3 rounded-sm bg-navy-800" /> Seçtiğin</span>
            </div>
          </div>
        </div>
      )}
      {sel && sel.date && sel.time && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm">
          <p className="font-semibold text-navy-800"><Icon name="calendar" className="mr-1 inline size-4" /> {fmtDayShort(sel.date)} · {sel.time}{minutes ? `-${addMinutes(sel.time, minutes)}` : ""}</p>
          {sel.sessions && sel.sessions.length > 1 ? (
            <p className="mt-1 text-[11px] leading-snug text-muted">{sel.sessions.length} görüşme, her hafta aynı saatte: {sel.sessions.map((d) => fmtDayShort(d)).join(" · ")}{minutes ? ` · her görüşme ${minutes} dk` : ""}</p>
          ) : (
            minutes > 0 && <p className="mt-1 text-xs text-muted">{minutes} dakikalık birebir online görüşme</p>
          )}
        </div>
      )}
    </div>
  );
}
