/** Kayıtlı adresler (fatura + gönderim) — istemci ve sunucu ortak */
export type Address = {
  name: string;
  phone: string;
  identityNumber: string; // TC kimlik (fatura için, isteğe bağlı)
  city: string;
  district: string;
  postalCode: string;
  address: string;
};

export type Addresses = { billing?: Address; shipping?: Address };

export const EMPTY_ADDRESS: Address = { name: "", phone: "", identityNumber: "", city: "", district: "", postalCode: "", address: "" };

export const ADDRESS_FIELDS: { key: keyof Address; label: string; wide?: boolean; hint?: string; maxLength?: number }[] = [
  { key: "name", label: "Ad Soyad" },
  { key: "phone", label: "Telefon" },
  { key: "identityNumber", label: "TC Kimlik / Vergi No", hint: "fatura için", maxLength: 11 },
  { key: "city", label: "Şehir" },
  { key: "district", label: "İlçe" },
  { key: "postalCode", label: "Posta kodu", maxLength: 5 },
  { key: "address", label: "Adres", wide: true },
];

/** Form verisinden adres okur; ön ek ile (örn. "billing_") birden çok adres aynı formda taşınır */
export function addressFromForm(fd: FormData, prefix = ""): Address {
  const g = (k: keyof Address, max = 200) => String(fd.get(`${prefix}${k}`) ?? "").trim().slice(0, max);
  return { name: g("name"), phone: g("phone", 30), identityNumber: g("identityNumber", 40).replace(/\D/g, "").slice(0, 11), city: g("city", 80), district: g("district", 80), postalCode: g("postalCode", 10).replace(/\s/g, ""), address: g("address", 500) };
}

/**
 * Telefon: Türkiye numarası (0 5xx xxx xx xx, +90…, 0090…; sabit hat ve 0850 dahil) ya da "+" ile yazılmış
 * yurt dışı numarası (8–15 rakam). Boşluk, tire ve parantez serbest.
 */
export function isValidPhone(v: string) {
  const t = (v || "").trim();
  if (!/^\+?[\d\s().-]+$/.test(t)) return false;
  const d = t.replace(/\D/g, "");
  if (t.startsWith("+") && !d.startsWith("90")) return d.length >= 8 && d.length <= 15;
  const n = d.replace(/^0090/, "").replace(/^90(?=\d{10}$)/, "").replace(/^0/, "");
  return /^[2-58]\d{9}$/.test(n);
}

/** TC kimlik numarası: 11 rakam, ilk rakam 0 olamaz, son iki rakam denetim rakamıdır */
export function isValidTckn(v: string) {
  if (!/^[1-9]\d{10}$/.test(v)) return false;
  const d = v.split("").map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  if ((((odd * 7 - even) % 10) + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}

/** Vergi kimlik numarası: 10 rakam, son rakam denetim rakamıdır */
export function isValidVkn(v: string) {
  if (!/^\d{10}$/.test(v)) return false;
  const d = v.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const t = (d[i] + 9 - i) % 10;
    const p = (t * 2 ** (9 - i)) % 9;
    sum += t !== 0 && p === 0 ? 9 : p;
  }
  return (10 - (sum % 10)) % 10 === d[9];
}

export function isValidIdentityNumber(v: string) {
  return isValidTckn(v) || isValidVkn(v);
}

export function isValidPostalCode(v: string) {
  return /^\d{5}$/.test(v);
}

/**
 * Formdaki adresin BİÇİM denetimi (telefon, kimlik/vergi no, posta kodu). Boş alanlar geçerlidir; hangi alanın
 * zorunlu olduğuna çağıran karar verir. Ham form değerine bakar: addressFromForm kimlik numarasındaki
 * rakam dışı karakterleri ayıkladığı için "abc" sessizce boş alana dönüşürdü.
 * Hata yoksa null, varsa kullanıcıya gösterilecek ileti döner. `title` iletinin başına eklenir (örn. "Gönderim adresi").
 */
export function addressFormatError(fd: FormData, prefix = "", title = ""): string | null {
  const raw = (k: keyof Address) => String(fd.get(`${prefix}${k}`) ?? "").trim();
  const msg = (m: string) => (title ? `${title}: ${m}` : m);
  const phone = raw("phone");
  if (phone && !isValidPhone(phone)) return msg("Telefon numarası geçersiz. Örnek: 0532 123 45 67");
  const idn = raw("identityNumber").replace(/\s/g, "");
  if (idn && !isValidIdentityNumber(idn)) return msg("TC kimlik numarası (11 rakam) ya da vergi numarası (10 rakam) geçersiz. Boş bırakabilirsin.");
  const pc = raw("postalCode").replace(/\s/g, "");
  if (pc && !isValidPostalCode(pc)) return msg("Posta kodu 5 rakam olmalı. Örnek: 35000");
  return null;
}

export function isAddressFilled(a: Address | undefined | null) {
  return !!a && !!(a.name || a.address || a.city);
}

export function normalizeAddress(a: Partial<Address> | undefined | null): Address {
  return { ...EMPTY_ADDRESS, ...(a ?? {}) };
}
