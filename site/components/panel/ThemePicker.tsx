"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { PANEL_THEMES } from "@/lib/panel-themes";
import { setPanelTheme } from "@/app/actions/auth";
import { Icon } from "@/components/site/Icon";

export function ThemeGrid({ current }: { current: string }) {
  const [sel, setSel] = useState(current);
  const [pending, start] = useTransition();
  const router = useRouter();
  const choose = (k: string) => {
    setSel(k);
    start(async () => {
      await setPanelTheme(k);
      router.refresh();
    });
  };
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {PANEL_THEMES.map((t) => (
        <button key={t.key} onClick={() => choose(t.key)} disabled={pending} className={`overflow-hidden rounded-xl border-2 text-left transition ${sel === t.key ? "border-sky-400" : "border-line hover:border-navy-300"}`}>
          {t.img ? <Image src={t.img} alt={t.label} width={300} height={90} className="h-16 w-full object-cover" style={{ objectPosition: t.focus }} /> : <div className="h-16 w-full bg-gradient-to-r from-[#142b56] to-[#5baecf]" />}
          <div className="p-2">
            <p className="text-sm font-semibold text-navy-800">{t.label}</p>
            <p className="text-xs text-muted">{t.desc}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

export function ThemeButton({ current }: { current: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(!open)} className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-navy-800 shadow hover:bg-white">
        <Icon name="paint" className="size-4" /> Görünüm
      </button>
      {open && <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />}
      {open && (
        <div className="absolute right-4 top-14 z-20 w-[min(92vw,460px)] rounded-2xl border border-line bg-white p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-bold text-navy-800">Panel görünümü</span>
            <button onClick={() => setOpen(false)} aria-label="Kapat"><Icon name="x" className="size-4" /></button>
          </div>
          <ThemeGrid current={current} />
        </div>
      )}
    </>
  );
}
