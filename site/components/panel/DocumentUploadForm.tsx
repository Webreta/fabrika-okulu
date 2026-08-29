"use client";

import { useState, useActionState } from "react";
import { uploadDocument } from "@/app/actions/panel";
import type { FormState } from "@/app/actions/auth";
import { Icon, type IconName } from "@/components/site/Icon";

const KINDS: { key: "ogrenci" | "mezun"; label: string; icon: IconName; hint: string }[] = [
  { key: "ogrenci", label: "Öğrenci", icon: "user", hint: "Lütfen öğrenci belgeni yükle · PDF/JPG/PNG · en fazla 10 MB" },
  { key: "mezun", label: "Yeni Mezun", icon: "award", hint: "Lütfen diplomanı yükle · PDF/JPG/PNG · en fazla 10 MB" },
];

export function DocumentUploadForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(uploadDocument, {});
  const [kind, setKind] = useState<"ogrenci" | "mezun">("ogrenci");
  const active = KINDS.find((k) => k.key === kind)!;
  return (
    <form action={action} className="space-y-4">
      <div className="flex gap-2">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setKind(k.key)}
            className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${kind === k.key ? "border-navy-800 bg-navy-800 text-white" : "border-line bg-white text-navy-800 hover:bg-surface"}`}
          >
            <Icon name={k.icon} className="size-4" />{k.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">{active.hint}</p>
      <input type="hidden" name="kind" value={kind} />
      <div>
        <label className="label">Belge</label>
        <input type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="input" />
      </div>
      <div>
        <label className="label">Not <span className="text-muted">(isteğe bağlı)</span></label>
        <textarea name="note" rows={2} className="input" placeholder="Hangi program için indirim istiyorsun?" />
      </div>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>}
      <button disabled={pending} className="btn-primary">{pending ? "Yükleniyor…" : "Belgeyi gönder"}</button>
    </form>
  );
}
