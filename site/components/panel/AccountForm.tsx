"use client";

import { useFieldId } from "@/components/useFieldId";
import { useActionState, useEffect, useState } from "react";
import { updateAccount, type FormState } from "@/app/actions/auth";

export function AccountForm({ user }: { user: { firstName: string; lastName: string; email: string; phone?: string } }) {
  const fid = useFieldId();
  const [state, action, pending] = useActionState<FormState, FormData>(updateAccount, {});
  // Alanlar kontrollü: form gönderilince tarayıcı alanları sayfanın ilk açılıştaki değerlerine döndürmesin
  // (yoksa sonraki kayıtta, örneğin yalnızca şifre değiştirirken, ad ve telefon eski hâline dönerdi)
  const [v, setV] = useState({ firstName: user.firstName, lastName: user.lastName, phone: user.phone ?? "" });
  useEffect(() => {
    // Sunucunun kaydettiği (boşlukları kırpılmış) değerler
    if (state.values) setV((x) => ({ ...x, ...state.values }));
  }, [state]);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor={fid("a1")} className="label">Ad</label><input id={fid("a1")} name="firstName" value={v.firstName} onChange={set("firstName")} maxLength={60} className="input" /></div>
        <div><label htmlFor={fid("a2")} className="label">Soyad</label><input id={fid("a2")} name="lastName" value={v.lastName} onChange={set("lastName")} maxLength={60} className="input" /></div>
        <div><label htmlFor={fid("a3")} className="label">E-posta</label><input id={fid("a3")} value={user.email} disabled className="input" /></div>
        <div><label htmlFor={fid("a4")} className="label">Telefon</label><input id={fid("a4")} name="phone" value={v.phone} onChange={set("phone")} maxLength={30} className="input" /></div>
      </div>
      <div className="border-t border-line pt-4">
        <p className="mb-3 text-sm font-semibold text-navy-800">Şifre değiştir <span className="font-normal text-muted">(isteğe bağlı)</span></p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor={fid("a5")} className="label">Mevcut şifre</label><input id={fid("a5")} type="password" name="currentPass" autoComplete="current-password" maxLength={200} className="input" /></div>
          <div><label htmlFor={fid("a6")} className="label">Yeni şifre</label><input id={fid("a6")} type="password" name="newPass" autoComplete="new-password" maxLength={200} className="input" /></div>
        </div>
        <p className="mt-2 text-xs text-muted">Şifreni değiştirdiğinde diğer cihazlardaki oturumların kapatılır.</p>
      </div>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>}
      <button disabled={pending} className="btn-primary">{pending ? "Kaydediliyor…" : "Kaydet"}</button>
    </form>
  );
}
