"use client";

import { useActionState } from "react";
import { sendContact } from "@/app/actions/contact";
import type { FormState } from "@/app/actions/auth";

export function ContactForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(sendContact, {});
  if (state.ok) {
    return <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-emerald-700">{state.ok}</p>;
  }
  return (
    <form action={action} className="mt-4 space-y-4">
      <input type="text" name="website" className="hidden" tabIndex={-1} autoComplete="off" />
      <div>
        <label className="label">Adınız</label>
        <input name="name" required className="input" />
      </div>
      <div>
        <label className="label">E-posta adresiniz</label>
        <input name="email" type="email" required className="input" />
      </div>
      <div>
        <label className="label">Konu</label>
        <input name="subject" className="input" />
      </div>
      <div>
        <label className="label">İletiniz</label>
        <textarea name="message" required rows={5} className="input" />
      </div>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Gönderiliyor…" : "Gönder"}
      </button>
    </form>
  );
}
