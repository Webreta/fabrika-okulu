/**
 * Yönlendirme parametreleri (`?r=`, `?donus=`, çıkıştaki `to` …) için güvenli hedef.
 * Yalnızca site içi yol kabul edilir: tek `/` ile başlamalı. `//site`, `/\site`, şema içeren adresler
 * (`https:`, `javascript:`) ve kontrol karakteri taşıyan değerler reddedilir; tarayıcılar `\` işaretini `/`
 * sayar ve sekme/satır sonu karakterlerini yok sayar, bu yüzden ikisi de yolun hiçbir yerinde kabul edilmez.
 * Geçersiz değerde `fallback` döner.
 */
export function safeInternalPath(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  if (value.length === 0 || value.length > 2000) return fallback;
  if (value[0] !== "/" || value[1] === "/") return fallback;
  if (value.includes("\\")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}
