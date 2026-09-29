/**
 * Yönetim formlarındaki metin uzunluğu sınırları. Sunucu doğrulaması ve input `maxLength` aynı değeri kullanır
 * (sınırsız alanlar 5.000 karakterlik ad/başlıkla liste ve filtre sayfalarını bozuyordu).
 */
export const LIMITS = {
  firstName: 60,
  lastName: 60,
  email: 160,
  phone: 30,
  password: 100,
  categoryName: 80,
  categoryDesc: 300,
  routeName: 80,
  routeDesc: 500,
  routeGoal: 80,
  routeNote: 400,
  couponCode: 40,
  pageTitle: 150,
  pageSlug: 80,
  pageHtml: 300000,
  instructorName: 80,
  instructorTitle: 120,
  instructorBio: 5000,
  url: 300,
} as const;

/** Kupon sayı sınırları */
export const COUPON_MAX_AMOUNT = 1_000_000;
export const COUPON_MAX_USAGE = 1_000_000;
export const COUPON_MAX_DAYS = 3650;

/** Sınır aşıldıysa hata metni, değilse null */
export function tooLong(label: string, value: string | null | undefined, max: number): string | null {
  return (value ?? "").length > max ? `${label} en fazla ${max} karakter olabilir.` : null;
}

/** İlk dolu hata metni (yoksa null) */
export function firstError(...checks: (string | null | undefined | false)[]): string | null {
  for (const c of checks) if (c) return c;
  return null;
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
