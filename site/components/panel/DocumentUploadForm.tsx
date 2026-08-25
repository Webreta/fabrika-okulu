"use client";

import { useActionState } from "react";
import { uploadDocument } from "@/app/actions/panel";
import type { FormState } from "@/app/actions/auth";

export function DocumentUploadForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(uploadDocument, {});
  return (
    <form action={action} className="space-y-4">
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
