"use client";

import { useFieldId } from "@/components/useFieldId";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSettings, clearSettingSecret, uploadSiteImage } from "@/app/actions/admin";
import type { SettingsKey } from "@/lib/settings";
import { Toast } from "@/components/Toast";

export type Field = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "checkbox" | "password" | "select" | "image" | "list" | "color";
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  rows?: number;
};

type Val = string | number | boolean | string[];

/**
 * Genel amaçlı ayar formu: alan listesi + mevcut değerler → saveSettings(key, patch).
 * Şifre alanlarının kayıtlı değeri tarayıcıya gelmez: `saved` yalnızca "kayıtlı mı" bilgisini taşır,
 * alan boş bırakılırsa kayıtlı şifre korunur.
 */
export function SettingsForm({ settingKey, title, fields, values, saved = {}, children }: { settingKey: SettingsKey; title?: string; fields: Field[]; values: Record<string, Val>; saved?: Record<string, boolean>; children?: React.ReactNode }) {
  const fid = useFieldId();
  const [v, setV] = useState<Record<string, Val>>(values);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: string, val: Val) => setV({ ...v, [k]: val });
  return (
    <div className="card">
      {title && <h2 className="mb-4 font-bold text-navy-800">{title}</h2>}
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((f) => {
          const full = f.type === "textarea" || f.type === "list";
          return (
            <div key={f.key} className={full ? "md:col-span-2" : ""}>
              {f.type === "checkbox" ? (
                <label className="flex items-center gap-2 text-sm font-medium text-navy-800"><input type="checkbox" checked={!!v[f.key]} onChange={(e) => set(f.key, e.target.checked)} /> {f.label}</label>
              ) : (
                <>
                  <label htmlFor={fid(f.key)} className="label">{f.label}</label>
                  {f.type === "textarea" && <textarea id={fid(f.key)} rows={f.rows ?? 4} value={String(v[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} className="input" />}
                  {f.type === "list" && <textarea id={fid(f.key)} rows={f.rows ?? 3} value={Array.isArray(v[f.key]) ? (v[f.key] as string[]).join("\n") : ""} onChange={(e) => set(f.key, e.target.value.split("\n"))} placeholder={f.placeholder} className="input" />}
                  {f.type === "text" && <input id={fid(f.key)} type="text" value={String(v[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} className="input" />}
                  {f.type === "password" && (
                    <>
                      <input id={fid(f.key)} type="password" autoComplete="new-password" value={String(v[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} placeholder={saved[f.key] ? "••••• (kayıtlı — değiştirmek için yaz)" : f.placeholder} className="input" />
                      {saved[f.key] && (
                        <p className="mt-1 text-[11px] text-muted">
                          Kayıtlı şifre güvenlik için gösterilmez; boş bırakırsan aynı kalır.{" "}
                          <button type="button" disabled={pending} onClick={() => { if (!window.confirm("Kayıtlı şifre silinsin mi? Yeni şifre girilene kadar e-posta gönderilemeyebilir.")) return; start(async () => { const r = await clearSettingSecret(settingKey, f.key); setMsg({ text: r.ok ? r.message ?? "Silindi." : r.error, ok: r.ok }); router.refresh(); }); }} className="text-red-600 underline underline-offset-2">Kayıtlı şifreyi sil</button>
                        </p>
                      )}
                    </>
                  )}
                  {f.type === "number" && <input id={fid(f.key)} type="number" value={Number(v[f.key] ?? 0)} onChange={(e) => set(f.key, Number(e.target.value))} className="input" />}
                  {f.type === "color" && <input id={fid(f.key)} type="color" value={String(v[f.key] ?? "#142b56")} onChange={(e) => set(f.key, e.target.value)} className="h-10 w-20" />}
                  {f.type === "select" && <select id={fid(f.key)} value={String(v[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} className="input">{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
                  {f.type === "image" && (
                    <div className="flex items-center gap-3">
                      {v[f.key] ? <img src={String(v[f.key])} alt="" className="h-14 w-24 rounded object-cover" /> : <div className="h-14 w-24 rounded bg-surface" />}
                      <label className="btn-secondary btn-sm cursor-pointer">{busy === f.key ? "…" : "Görsel seç"}<input id={fid(f.key)} type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setBusy(f.key); const fd = new FormData(); fd.append("file", file); const r = await uploadSiteImage(fd); if (r.ok) set(f.key, r.url); setBusy(""); }} /></label>
                      {v[f.key] && <button onClick={() => set(f.key, "")} className="text-xs text-red-600">Kaldır</button>}
                    </div>
                  )}
                </>
              )}
              {f.hint && <p className="mt-1 text-[11px] text-muted">{f.hint}</p>}
            </div>
          );
        })}
      </div>
      {children}
      <div className="mt-4 flex items-center gap-3">
        <button disabled={pending} onClick={() => start(async () => {
          const r = await saveSettings(settingKey, v as never);
          setMsg({ text: r.ok ? "Kaydedildi." : r.error, ok: r.ok });
          // Yazılan şifre kaydedildikten sonra alanda tutulmaz
          if (r.ok && fields.some((f) => f.type === "password")) setV((cur) => ({ ...cur, ...Object.fromEntries(fields.filter((f) => f.type === "password").map((f) => [f.key, ""])) }));
          router.refresh();
        })} className="btn-primary">{pending ? "…" : "Kaydet"}</button>
        {msg && <Toast message={msg.text} ok={msg.ok} onDone={() => setMsg(null)} />}
      </div>
    </div>
  );
}
