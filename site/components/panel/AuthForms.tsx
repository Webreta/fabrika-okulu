"use client";

import { useFieldId } from "@/components/useFieldId";
import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { login, register, lostPassword, resetPassword, type FormState } from "@/app/actions/auth";
import { Icon } from "@/components/site/Icon";

function PasswordInput({ id, name, placeholder, autoComplete }: { id?: string; name: string; placeholder: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={show ? "text" : "password"} name={name} required maxLength={200} placeholder={placeholder} autoComplete={autoComplete} className="input pr-10" />
      <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted" aria-label={show ? "Şifreyi gizle" : "Şifreyi göster"}>
        <Icon name="eye" className="size-4" />
      </button>
    </div>
  );
}

function Error({ msg }: { msg?: string }) {
  return msg ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p> : null;
}

export function LoginForm({ area, registerHref, forgotHref }: { area: "panel" | "egitmen" | "admin"; registerHref?: string; forgotHref: string }) {
  const fid = useFieldId();
  const sp = useSearchParams();
  const next = sp.get("r") ?? "";
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="area" value={area} />
      <div>
        <label htmlFor={fid("a1")} className="label">E-posta</label>
        <input id={fid("a1")} type="email" name="email" required maxLength={160} autoComplete="username" className="input" />
      </div>
      <div>
        <label htmlFor={fid("a2")} className="label">Şifre</label>
        <PasswordInput id={fid("a2")} name="password" placeholder="••••••••" autoComplete="current-password" />
      </div>
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="remember" value="1" defaultChecked /> Beni hatırla</label>
        <Link href={forgotHref} className="inline-flex min-h-10 items-center text-sky-600 hover:underline md:min-h-0">Şifremi unuttum</Link>
      </div>
      <Error msg={state.error} />
      <button disabled={pending} className="btn-primary w-full py-3">{pending ? "Giriş yapılıyor…" : "Giriş yap"}</button>
      {registerHref && (
        <p className="text-center text-sm text-muted">Hesabın yok mu? <Link href={`${registerHref}${next ? `?r=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-sky-600 hover:underline">Üye ol</Link></p>
      )}
    </form>
  );
}

export function RegisterForm() {
  const fid = useFieldId();
  const sp = useSearchParams();
  const next = sp.get("r") ?? "";
  const [state, action, pending] = useActionState<FormState, FormData>(register, {});
  // Alanlar kontrollü: form hata ile dönünce yazılanlar ve onay kutusu silinmez (şifreler yeniden yazılır)
  const [f, setF] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [kvkk, setKvkk] = useState(false);
  // Form elle gönderilir: React, action ile gönderilen formu işlem bitince sıfırlar ve onay kutusunun işaretini kaldırır
  const [, startSubmit] = useTransition();
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startSubmit(() => action(fd));
  };
  const bind = (k: keyof typeof f) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value })) });
  return (
    <form onSubmit={submit} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor={fid("a3")} className="label">Ad</label><input id={fid("a3")} name="firstName" {...bind("firstName")} required maxLength={60} className="input" autoComplete="given-name" /></div>
        <div><label htmlFor={fid("a4")} className="label">Soyad</label><input id={fid("a4")} name="lastName" {...bind("lastName")} required maxLength={60} className="input" autoComplete="family-name" /></div>
      </div>
      <div><label htmlFor={fid("a5")} className="label">E-posta</label><input id={fid("a5")} type="email" name="email" {...bind("email")} required maxLength={160} className="input" autoComplete="email" /></div>
      <div><label htmlFor={fid("a6")} className="label">Telefon <span className="text-muted">(isteğe bağlı)</span></label><input id={fid("a6")} name="phone" {...bind("phone")} maxLength={30} className="input" autoComplete="tel" /></div>
      <div><label htmlFor={fid("a7")} className="label">Şifre</label><PasswordInput id={fid("a7")} name="password" placeholder="En az 8 karakter" autoComplete="new-password" /></div>
      <div><label htmlFor={fid("a8")} className="label">Şifre (tekrar)</label><PasswordInput id={fid("a8")} name="password2" placeholder="••••••••" autoComplete="new-password" /></div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="kvkk" value="1" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} className="mt-1" />
        <span><Link href="/kvkk-aydinlatma-metni" target="_blank" className="text-sky-600 underline">KVKK Aydınlatma Metni</Link>&apos;ni okudum, kabul ediyorum.</span>
      </label>
      <Error msg={state.error} />
      <button disabled={pending} className="btn-primary w-full py-3">{pending ? "Kayıt yapılıyor…" : "Üye ol"}</button>
      <p className="text-center text-sm text-muted">Zaten üye misin? <Link href="/panel/giris" className="font-semibold text-sky-600 hover:underline">Giriş yap</Link></p>
    </form>
  );
}

export function LostPasswordForm() {
  const fid = useFieldId();
  const [state, action, pending] = useActionState<FormState, FormData>(lostPassword, {});
  if (state.ok) return <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>;
  return (
    <form action={action} className="space-y-4">
      <div><label htmlFor={fid("a9")} className="label">E-posta</label><input id={fid("a9")} type="email" name="email" required maxLength={160} className="input" /></div>
      <Error msg={state.error} />
      <button disabled={pending} className="btn-primary w-full py-3">{pending ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}</button>
      <p className="text-center text-sm"><Link href="/panel/giris" className="text-sky-600 hover:underline">← Girişe dön</Link></p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const fid = useFieldId();
  const [state, action, pending] = useActionState<FormState, FormData>(resetPassword, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="key" value={token} />
      <div><label htmlFor={fid("a10")} className="label">Yeni şifre</label><PasswordInput id={fid("a10")} name="password" placeholder="En az 8 karakter" autoComplete="new-password" /></div>
      <div><label htmlFor={fid("a11")} className="label">Yeni şifre (tekrar)</label><PasswordInput id={fid("a11")} name="password2" placeholder="••••••••" autoComplete="new-password" /></div>
      <Error msg={state.error} />
      <button disabled={pending} className="btn-primary w-full py-3">{pending ? "Kaydediliyor…" : "Şifreyi güncelle"}</button>
    </form>
  );
}
