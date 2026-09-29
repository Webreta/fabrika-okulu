/**
 * Adres ya da formdan gelen kimliği doğrular: yalnızca pozitif tam sayı kabul edilir.
 * Elle oynanmış değer ("abc", "1.5", "1e9", boş) veritabanı sorgusuna gitmez; çağıran 404/hata döndürür.
 */
export function toId(value: unknown): number | null {
  const s = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^[1-9]\d{0,9}$/.test(s)) return null;
  const n = Number(s);
  // integer kolon sınırı (PostgreSQL int4)
  return n <= 2147483647 ? n : null;
}
