"use client";

import { useActionState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadResumeFile, deleteResumeFile } from "@/app/actions/panel";
import type { FormState } from "@/app/actions/auth";
import { fmtBytes, RESUME_QUOTA_BYTES, type ResumeKind } from "@/lib/resume-kinds";
import { Icon } from "@/components/site/Icon";

/** Tek tür için yükleme formu + kota çubuğu */
export function ResumeUploadForm({ kind, used }: { kind: ResumeKind; used: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(uploadResumeFile, {});
  const fileRef = useRef<HTMLInputElement>(null);
  const percent = Math.min(100, Math.round((used / RESUME_QUOTA_BYTES) * 100));
  const full = used >= RESUME_QUOTA_BYTES;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="kind" value={kind} />
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span>Kullanılan alan</span>
          <span>{fmtBytes(used)} / {fmtBytes(RESUME_QUOTA_BYTES)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface"><div className={`h-full rounded-full ${percent >= 90 ? "bg-red-500" : "bg-sky-500"}`} style={{ width: `${percent}%` }} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" name="file" required disabled={full} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" className="input flex-1" />
        <button disabled={pending || full} className="btn-primary shrink-0"><Icon name="upload" className="size-4" /> {pending ? "Yükleniyor…" : "Yükle"}</button>
      </div>
      {full && <p className="text-xs text-amber-700">Alan dolu. Yeni dosya için önce bir dosya sil.</p>}
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>}
    </form>
  );
}

export function DeleteResumeFileButton({ id, name }: { id: number; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      title="Sil"
      onClick={() => { if (confirm(`"${name}" silinsin mi?`)) start(async () => { await deleteResumeFile(id); router.refresh(); }); }}
      className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      <Icon name="trash" className="size-4" />
    </button>
  );
}
