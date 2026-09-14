"use client";

import { useState } from "react";
import { Icon } from "@/components/site/Icon";

/**
 * S.S.S. akordeonu — lacivert kartlar: numara, soru, sağda artı düğmesi (açılınca 45° dönüp çarpı olur).
 * Açık kartta sol mavi şerit + mavi ışık; cevap grid-rows geçişiyle yumuşak açılır. Aynı anda tek soru açık kalır.
 */
export function FaqAccordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const toggle = (i: number) => setOpen((cur) => (cur === i ? null : i));
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div
            key={i}
            className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 text-white ring-1 transition-[box-shadow,ring-color,transform] duration-300 ${isOpen ? "ring-sky-400/60 shadow-[0_24px_50px_-24px_rgba(91,174,207,.6)]" : "ring-white/10 hover:-translate-y-0.5 hover:ring-white/25"}`}
          >
            {/* Açık kartta mavi ışık */}
            <div className={`pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-sky-400/25 blur-3xl transition-opacity duration-500 ${isOpen ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`} />
            {/* Sol şerit */}
            <span className={`absolute left-0 top-0 h-full w-1 origin-top bg-gradient-to-b from-sky-300 to-sky-500 transition-transform duration-300 ${isOpen ? "scale-y-100" : "scale-y-0"}`} />

            <button type="button" onClick={() => toggle(i)} aria-expanded={isOpen} aria-controls={`faq-${i}`} className="relative flex w-full cursor-pointer items-center gap-4 px-5 py-4 text-left sm:px-6">
              <span className={`shrink-0 font-mono text-xs font-bold tracking-widest transition-colors ${isOpen ? "text-sky-300" : "text-navy-300"}`}>{String(i + 1).padStart(2, "0")}</span>
              <span className={`flex-1 font-semibold leading-snug transition-colors ${isOpen ? "text-white" : "text-navy-50 group-hover:text-white"}`}>{it.q}</span>
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${isOpen ? "rotate-45 border-sky-300 bg-sky-400 text-navy-900" : "border-white/15 bg-white/5 text-sky-300 group-hover:border-sky-300/60"}`}>
                <Icon name="plus" className="size-4" />
              </span>
            </button>

            <div id={`faq-${i}`} className="relative grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}>
              <div className="overflow-hidden">
                <div className={`px-5 pb-5 pl-[3.75rem] transition-[opacity,transform] duration-300 sm:px-6 sm:pl-16 ${isOpen ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"}`}>
                  <div className="h-px w-10 bg-sky-400/60" />
                  <p className="mt-3 text-sm leading-relaxed text-navy-100 sm:text-[15px]">{it.a}</p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
