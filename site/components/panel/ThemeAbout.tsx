"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Icon } from "@/components/site/Icon";
import { BANNER_ASPECT, type ThemeAbout } from "@/lib/panel-themes";

/**
 * Çalışma Odası banner'ının sağ altındaki "Görsel hakkında" düğmesi: temanın kapak görseline konu olan yer
 * hakkında kısa bilgi penceresi (görsel + başlık + metin + varsa bağlantı). Esc ve dışına tıklayınca kapanır.
 */
export function ThemeAboutButton({ about, img, themeLabel }: { about: ThemeAbout; img: string | null; themeLabel: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      {/* Telefonda yalnızca ikon (küçük daire), sm+ metinli kapsül */}
      <button onClick={() => setOpen(true)} aria-label="Görsel hakkında" title="Görsel hakkında" className="absolute bottom-3 right-3 flex size-8 items-center justify-center rounded-full bg-white/90 text-navy-800 shadow backdrop-blur transition hover:bg-white sm:bottom-4 sm:right-4 sm:size-auto sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs sm:font-semibold">
        <Icon name="info" className="size-4" /><span className="hidden sm:inline">Görsel hakkında</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/60 p-4 backdrop-blur-[2px] sm:items-center" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={about.title} className="theme-about-in w-full max-w-lg overflow-hidden rounded-3xl bg-white text-ink shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {img && (
              <div className="relative">
                <Image src={img} alt={about.title} width={1600} height={679} className="w-full object-cover" style={{ aspectRatio: BANNER_ASPECT }} />
                <span className="absolute left-4 top-4 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-navy-800 shadow">{themeLabel} teması</span>
                <button onClick={() => setOpen(false)} aria-label="Kapat" className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-white/90 text-navy-800 shadow hover:bg-white"><Icon name="x" className="size-4" /></button>
              </div>
            )}
            <div className="p-5 sm:p-6">
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-600"><Icon name="globe" className="size-3.5" /> Görsel hakkında</p>
              <h2 className="mt-1 text-xl font-bold text-navy-800">{about.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-navy-700">{about.text}</p>
              {about.link && (
                <a href={about.link.href} target="_blank" rel="noopener" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-600 hover:underline"><Icon name="external" className="size-4" /> {about.link.label}</a>
              )}
              <div className="mt-5 flex justify-end">
                <button onClick={() => setOpen(false)} className="btn-primary btn-sm">Kapat</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
