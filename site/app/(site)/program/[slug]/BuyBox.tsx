"use client";

import { useState } from "react";
import { addToCart } from "@/app/actions/cart";
import { Icon } from "@/components/site/Icon";

type P = { id: number; name: string; range: string; left: number; full: boolean; schedule: number };

export function BuyBox({
  courseId, isFree, periodBased, periods, buttonType, whatsappUrl,
}: { courseId: number; isFree: boolean; periodBased: boolean; periods: P[]; buttonType: string; whatsappUrl: string }) {
  const [periodId, setPeriodId] = useState<number | null>(periods.find((p) => !p.full)?.id ?? null);
  const [open, setOpen] = useState(false);
  const sel = periods.find((p) => p.id === periodId);
  const showCart = buttonType !== "whatsapp";
  const showWa = (buttonType === "whatsapp" || buttonType === "both") && !!whatsappUrl;

  return (
    <div className="mt-4 space-y-3">
      {periodBased && (
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
          {open && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/60 p-4 sm:items-center" onClick={() => setOpen(false)}>
              <div className="w-full max-w-md rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
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
              </div>
            </div>
          )}
        </div>
      )}
      {showCart && (
        <form action={addToCart}>
          <input type="hidden" name="courseId" value={courseId} />
          {periodId && <input type="hidden" name="periodId" value={periodId} />}
          <button disabled={periodBased && !periodId} className="btn-primary w-full py-3">
            <Icon name={isFree ? "check" : "cart"} className="size-4" /> {isFree ? "Ücretsiz Kayıt Ol" : "Hemen Kayıt Ol"}
          </button>
        </form>
      )}
      {showWa && (
        <a href={whatsappUrl} target="_blank" rel="noopener" className="btn w-full bg-emerald-500 py-3 text-white hover:bg-emerald-600">
          <Icon name="whatsapp" className="size-4" /> WhatsApp ile bilgi al
        </a>
      )}
    </div>
  );
}
