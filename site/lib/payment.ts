import "server-only";
import { iyzicoEnabled } from "@/lib/iyzico";
import { paytrEnabled } from "@/lib/paytr";
import type { PaymentSettings } from "@/lib/settings";

export type PaymentMode = "free" | "manual" | "iyzico" | "paytr";

/**
 * Ödeme yolu: 0 TL → free; seçili kart sağlayıcısının anahtarları yoksa havale/EFT'ye düşer.
 * Ödeme sayfası, ödeme başlatma ve sağlık kontrolü aynı kuralı kullanır.
 */
export async function resolvePaymentMode(setting: Pick<PaymentSettings, "provider">, total: number): Promise<PaymentMode> {
  if (total === 0) return "free";
  if (setting.provider === "paytr") return (await paytrEnabled()) ? "paytr" : "manual";
  if (setting.provider === "iyzico") return iyzicoEnabled() ? "iyzico" : "manual";
  return "manual";
}

/** Kart sağlayıcısı seçili ama anahtarları eksik mi (sağlık kontrolü / ayarlar sayfası) */
export async function cardProviderMissingKeys(setting: Pick<PaymentSettings, "provider">) {
  if (setting.provider === "paytr") return !(await paytrEnabled());
  if (setting.provider === "iyzico") return !iyzicoEnabled();
  return false;
}

export const PROVIDER_LABELS: Record<string, string> = { iyzico: "iyzico", paytr: "PayTR", manual: "Havale / EFT", free: "Ücretsiz" };
