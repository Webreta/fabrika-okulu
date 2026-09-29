"use client";

import { useFieldId } from "@/components/useFieldId";
import { useActionState } from "react";
import { sendContact } from "@/app/actions/contact";
import type { FormState } from "@/app/actions/auth";
import { Icon } from "@/components/site/Icon";

/** İletişim formu: iki sütunlu ad/e-posta, konu, ileti; gönderimde ikonlu teşekkür kartı */
export function ContactForm() {
  const fid = useFieldId();
  const [state, action, pending] = useActionState<FormState, FormData>(sendContact, {});
  if (state.ok) {
    return (
      <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-6 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500 text-white"><Icon name="check" className="size-6" /></span>
        <p className="mt-3 font-semibold text-emerald-800">{state.ok}</p>
        <p className="mt-1 text-sm text-emerald-700">Mesajın bize ulaştı; en kısa sürede dönüş yapacağız.</p>
      </div>
    );
  }
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="text" name="website" className="hidden" tabIndex={-1} autoComplete="off" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={fid("a1")} className="label">Adın</label>
          <input id={fid("a1")} name="name" required maxLength={100} autoComplete="name" placeholder="Ad Soyad" className="input" />
        </div>
        <div>
          <label htmlFor={fid("a2")} className="label">E-posta</label>
          <input id={fid("a2")} name="email" type="email" required maxLength={160} autoComplete="email" placeholder="ornek@eposta.com" className="input" />
        </div>
      </div>
      <div>
        <label htmlFor={fid("a3")} className="label">Konu</label>
        <input id={fid("a3")} name="subject" maxLength={200} placeholder="Örn. Takvimli program hakkında soru" className="input" />
      </div>
      <div>
        <label htmlFor={fid("a4")} className="label">İletin</label>
        <textarea id={fid("a4")} name="message" required maxLength={5000} rows={5} placeholder="Ne öğrenmek istediğini ya da sorununu kısaca anlat…" className="input resize-y" />
      </div>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full py-3 text-base disabled:opacity-60">
        {pending ? "Gönderiliyor…" : <>Gönder <Icon name="arrowRight" className="size-4" /></>}
      </button>
      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted"><Icon name="lock" className="size-3" /> Bilgilerin yalnızca sana dönüş yapmak için kullanılır.</p>
    </form>
  );
}
