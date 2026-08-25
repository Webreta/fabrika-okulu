"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { login, register, lostPassword, resetPassword, type FormState } from "@/app/actions/auth";
import { Icon } from "@/components/site/Icon";

function PasswordInput({ name, placeholder, autoComplete }: { name: string; placeholder: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input type={show ? "text" : "password"} name={name} required placeholder={placeholder} autoComplete={autoComplete} className="input pr-10" />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted" aria-label="Şifreyi göster">
        <Icon name="eye" className="size-4" />
      </button>
    </div>
  );
}

function Error({ msg }: { msg?: string }) {
  return msg ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p> : null;
}

export function LoginForm({ area, registerHref, forgotHref }: { area: "panel" | "egitmen" | "admin"; registerHref?: string; forgotHref: string }) {
  const sp = useSearchParams();
  const next = sp.get("r") ?? "";
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="area" value={area} />
      <div>
        <label className="label">E-posta</label>
        <input type="email" name="email" required autoComplete="username" className="input" />
      </div>
      <div>
        <label className="label">Şifre</label>
        <PasswordInput name="password" placeholder="••••••••" autoComplete="current-password" />
      </div>
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="remember" value="1" defaultChecked /> Beni hatırla</label>
        <Link href={forgotHref} className="text-sky-600 hover:underline">Şifremi unuttum</Link>
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
  const sp = useSearchParams();
  const next = sp.get("r") ?? "";
  const [state, action, pending] = useActionState<FormState, FormData>(register, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Ad</label><input name="firstName" required className="input" autoComplete="given-name" /></div>
        <div><label className="label">Soyad</label><input name="lastName" required className="input" autoComplete="family-name" /></div>
      </div>
      <div><label className="label">E-posta</label><input type="email" name="email" required className="input" autoComplete="email" /></div>
      <div><label className="label">Telefon <span className="text-muted">(isteğe bağlı)</span></label><input name="phone" className="input" autoComplete="tel" /></div>
      <div><label className="label">Şifre</label><PasswordInput name="password" placeholder="En az 6 karakter" autoComplete="new-password" /></div>
      <div><label className="label">Şifre (tekrar)</label><PasswordInput name="password2" placeholder="••••••••" autoComplete="new-password" /></div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="kvkk" value="1" className="mt-1" />
        <span><Link href="/kvkk-aydinlatma-metni" target="_blank" className="text-sky-600 underline">KVKK Aydınlatma Metni</Link>&apos;ni okudum, kabul ediyorum.</span>
      </label>
      <Error msg={state.error} />
      <button disabled={pending} className="btn-primary w-full py-3">{pending ? "Kayıt yapılıyor…" : "Üye ol"}</button>
      <p className="text-center text-sm text-muted">Zaten üye misin? <Link href="/panel/giris" className="font-semibold text-sky-600 hover:underline">Giriş yap</Link></p>
    </form>
  );
}

export function LostPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(lostPassword, {});
  if (state.ok) return <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>;
  return (
    <form action={action} className="space-y-4">
      <div><label className="label">E-posta</label><input type="email" name="email" required className="input" /></div>
      <Error msg={state.error} />
      <button disabled={pending} className="btn-primary w-full py-3">{pending ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}</button>
      <p className="text-center text-sm"><Link href="/panel/giris" className="text-sky-600 hover:underline">← Girişe dön</Link></p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPassword, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="key" value={token} />
      <div><label className="label">Yeni şifre</label><PasswordInput name="password" placeholder="En az 6 karakter" autoComplete="new-password" /></div>
      <div><label className="label">Yeni şifre (tekrar)</label><PasswordInput name="password2" placeholder="••••••••" autoComplete="new-password" /></div>
      <Error msg={state.error} />
      <button disabled={pending} className="btn-primary w-full py-3">{pending ? "Kaydediliyor…" : "Şifreyi güncelle"}</button>
    </form>
  );
}
