import "server-only";

/** Örnek dosyalarda/kaynak kodda yazan, herkesin bildiği değerler */
const SAMPLE_SECRETS = ["degistir-beni", "changeme", "change-me", "secret", "cron"];
const MIN_LENGTH = 16;

export type CronSecretState = "ok" | "yok" | "varsayilan" | "kisa";

/** Zamanlayıcı anahtarının durumu: tanımsız, örnek değerde, çok kısa ya da uygun */
export function cronSecretState(): CronSecretState {
  const s = (process.env.CRON_SECRET ?? "").trim();
  if (!s) return "yok";
  if (SAMPLE_SECRETS.includes(s.toLowerCase())) return "varsayilan";
  if (s.length < MIN_LENGTH) return "kisa";
  return "ok";
}
