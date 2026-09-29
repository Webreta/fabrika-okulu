/**
 * YENİ belirlenen şifrelerin kuralı (kayıt, şifre sıfırlama, hesap formu, yöneticinin verdiği şifre).
 * Girişte uygulanmaz: eski, daha kısa şifresi olan kullanıcı girmeye devam eder.
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

/** Şifre kurala uymuyorsa Türkçe ileti, uyuyorsa null döner */
export function passwordError(password: string, label = "Şifre"): string | null {
  if (password.length < PASSWORD_MIN) return `${label} en az ${PASSWORD_MIN} karakter olmalı.`;
  if (password.length > PASSWORD_MAX) return `${label} en fazla ${PASSWORD_MAX} karakter olabilir.`;
  if (password.trim().length === 0) return `${label} yalnızca boşluktan oluşamaz.`;
  return null;
}
