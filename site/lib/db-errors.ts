/**
 * Veritabanı hata kodları. Tekil alan çakışması (aynı adres/kod/e-posta) ekranı çökertmek yerine
 * kullanıcıya mesaj olarak dönmeli; aksiyonlar kaydı try/catch ile sarıp bu yardımcılarla ayırt eder.
 * Hata doğrudan postgres.js'ten ya da Drizzle'ın sardığı hatanın `cause` alanından gelebilir.
 */
function pgCode(e: unknown): string {
  for (let x = e as { code?: unknown; cause?: unknown } | null | undefined, i = 0; x && i < 4; x = x.cause as typeof x, i++) {
    if (typeof x.code === "string" && /^[0-9A-Z]{5}$/.test(x.code)) return x.code;
  }
  return "";
}

/** Tekil (unique) alan çakışması */
export const isUniqueViolation = (e: unknown) => pgCode(e) === "23505";

/** Var olmayan kayda bağ (foreign key) */
export const isForeignKeyViolation = (e: unknown) => pgCode(e) === "23503";

/** Sayı sınırı aşımı / geçersiz sayı biçimi */
export const isNumericError = (e: unknown) => ["22003", "22P02"].includes(pgCode(e));
