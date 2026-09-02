"use client";

import { useState, useTransition } from "react";
import { setNotifyPrefs } from "@/app/actions/auth";
import { NOTIFY_CATEGORIES, type NotifyPrefs } from "@/lib/notify-prefs";

function Switch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-sky-500" : "bg-navy-200"}`}>
      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

/** Konu bazlı bildirim tercihleri: panel (uygulama içi + tarayıcı) ve e-posta ayrı anahtarlar; her değişiklik anında kaydedilir */
export function NotifyPrefsForm({ initial, title }: { initial: NotifyPrefs; title: string }) {
  const [prefs, setPrefs] = useState<NotifyPrefs>(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const commit = (next: NotifyPrefs) => {
    setPrefs(next);
    setSaved(false);
    start(async () => { await setNotifyPrefs(next); setSaved(true); });
  };
  const keys = NOTIFY_CATEGORIES.flatMap((c) => [c.key, `mail:${c.key}`]);
  const allOn = keys.every((k) => prefs[k] !== false);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-bold text-navy-800">{title}</h3>
        <button type="button" onClick={() => commit(Object.fromEntries(keys.map((k) => [k, !allOn])))} disabled={pending} className="btn-secondary btn-sm shrink-0">{allOn ? "Tümünü kapat" : "Tümünü aç"}</button>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-5 gap-y-0">
        <span />
        <span className="pb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">Panel</span>
        <span className="pb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">E-posta</span>
        {NOTIFY_CATEGORIES.map((c) => {
          const app = prefs[c.key] !== false;
          const mail = prefs[`mail:${c.key}`] !== false;
          return (
            <div key={c.key} className="contents">
              <div className="border-t border-line py-3">
                <p className="text-sm font-semibold text-navy-800">{c.label}</p>
                <p className="text-xs text-muted">{c.desc}</p>
              </div>
              <div className="flex justify-center border-t border-line py-3"><Switch on={app} label={`${c.label} — panel`} disabled={pending} onChange={(v) => commit({ ...prefs, [c.key]: v })} /></div>
              <div className="flex justify-center border-t border-line py-3"><Switch on={mail} label={`${c.label} — e-posta`} disabled={pending} onChange={(v) => commit({ ...prefs, [`mail:${c.key}`]: v })} /></div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 h-4 text-xs text-emerald-700">{saved && !pending ? "Kaydedildi." : ""}</p>
    </div>
  );
}
