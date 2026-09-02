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
  { key: "identityNumber", label: "TC Kimlik No", hint: "fatura için", maxLength: 11 },
  { key: "city", label: "Şehir" },
  { key: "district", label: "İlçe" },
  { key: "postalCode", label: "Posta kodu", maxLength: 10 },
  { key: "address", label: "Adres", wide: true },
];

/** Form verisinden adres okur; ön ek ile (örn. "billing_") birden çok adres aynı formda taşınır */
export function addressFromForm(fd: FormData, prefix = ""): Address {
  const g = (k: keyof Address, max = 200) => String(fd.get(`${prefix}${k}`) ?? "").trim().slice(0, max);
  return { name: g("name"), phone: g("phone", 30), identityNumber: g("identityNumber", 40).replace(/\D/g, "").slice(0, 11), city: g("city", 80), district: g("district", 80), postalCode: g("postalCode", 10), address: g("address", 500) };
}

export function isAddressFilled(a: Address | undefined | null) {
  return !!a && !!(a.name || a.address || a.city);
}

export function normalizeAddress(a: Partial<Address> | undefined | null): Address {
  return { ...EMPTY_ADDRESS, ...(a ?? {}) };
}
