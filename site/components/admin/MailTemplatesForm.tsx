"use client";

import { Toast } from "@/components/Toast";

import { useState, useTransition } from "react";
import { saveSettings } from "@/app/actions/admin";
import type { MailTemplateSettings } from "@/lib/settings";

export function MailTemplatesForm({ templates, types }: { templates: MailTemplateSettings; types: { key: string; title: string; to: string }[] }) {
  const [t, setT] = useState<MailTemplateSettings>(templates);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const get = (k: string) => t[k] ?? { enabled: true, subject: "" };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Her olay için e-postayı aç/kapat ve konu satırını özelleştir (boş = varsayılan). SMTP ayarları: Ayarlar → E-posta.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {types.map((x) => (
          <div key={x.key} className="card flex items-start gap-3">
            <input type="checkbox" checked={get(x.key).enabled} onChange={(e) => setT({ ...t, [x.key]: { ...get(x.key), enabled: e.target.checked } })} className="mt-1" />
            <div className="flex-1">
              <p className="font-semibold text-navy-800">{x.title}</p>
              <p className="text-xs text-muted">Alıcı: {x.to}</p>
              <input value={get(x.key).subject} onChange={(e) => setT({ ...t, [x.key]: { ...get(x.key), subject: e.target.value } })} placeholder="Özel konu (isteğe bağlı)" className="input mt-2 text-xs" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3"><button disabled={pending} onClick={() => start(async () => { const r = await saveSettings("mailTemplates", t); setMsg(r.ok ? "Kaydedildi." : r.error); })} className="btn-primary">Kaydet</button>{msg && <Toast message={msg} ok={msg === "Kaydedildi."} onDone={() => setMsg("")} />}</div>
    </div>
  );
}
