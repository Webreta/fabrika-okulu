"use client";

import { useActionState } from "react";
import { updateAccount, type FormState } from "@/app/actions/auth";

export function AccountForm({ user }: { user: { firstName: string; lastName: string; email: string; phone?: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateAccount, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">Ad</label><input name="firstName" defaultValue={user.firstName} className="input" /></div>
        <div><label className="label">Soyad</label><input name="lastName" defaultValue={user.lastName} className="input" /></div>
        <div><label className="label">E-posta</label><input value={user.email} disabled className="input" /></div>
        <div><label className="label">Telefon</label><input name="phone" defaultValue={user.phone ?? ""} className="input" /></div>
      </div>
      <div className="border-t border-line pt-4">
        <p className="mb-3 text-sm font-semibold text-navy-800">Şifre değiştir <span className="font-normal text-muted">(isteğe bağlı)</span></p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Mevcut şifre</label><input type="password" name="currentPass" autoComplete="current-password" className="input" /></div>
          <div><label className="label">Yeni şifre</label><input type="password" name="newPass" autoComplete="new-password" className="input" /></div>
        </div>
      </div>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>}
      <button disabled={pending} className="btn-primary">{pending ? "Kaydediliyor…" : "Kaydet"}</button>
    </form>
  );
}
