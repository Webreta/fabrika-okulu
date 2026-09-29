import "server-only";

// Tek uzun ömürlü Node süreci için in-memory rate limit yeterli.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  max = 5,
  windowMs = 15 * 60 * 1000
): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
  }
  return bucket.count <= max;
}

// ---- Başarısız deneme sayaçları (giriş) ----
// checkRateLimit her çağrıda sayar; girişte yalnızca BAŞARISIZ denemeler sayılmalı ki
// doğru şifreyle giren kullanıcı kendi sınırını doldurmasın.

/** Sınır dolmuş mu? (saymaz, yalnızca bakar) */
export function isRateLimited(key: string, max: number): boolean {
  const b = buckets.get(key);
  return !!b && b.resetAt >= Date.now() && b.count >= max;
}

/** Başarısız denemeyi kaydeder */
export function recordFailure(key: string, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) buckets.set(key, { count: 1, resetAt: now + windowMs });
  else b.count += 1;
  if (buckets.size > 10_000) {
    for (const [k, x] of buckets) if (x.resetAt < now) buckets.delete(k);
  }
}

/** Başarılı işlemden sonra sayacı sıfırlar */
export function clearRateLimit(key: string) {
  buckets.delete(key);
}
