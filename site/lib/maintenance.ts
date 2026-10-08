import "server-only";
import { getSetting, getRawSetting, type MaintenanceSettings } from "@/lib/settings";

// Bakım modu (dışarıya gösterme): açıkken siteyi yalnızca giriş yapmış yöneticiler görür.
// Engelleme middleware.ts içinde yapılır; middleware veritabanına erişemediği için durumu /api/bakim ucundan sorar.
// Öncelik: panelde (Yönetim → Ayarlar → Bakım modu) bir kez kaydedilmiş ayar → MAINTENANCE_MODE ortam değişkeni (on/off).
// Ortam değişkeni yalnızca panelde hiç kayıt yokken (canlıya ilk çıkış) geçerlidir; yönetici panelden kaydedince
// kutu belirleyici olur (2026-10-08: canlıda kutu işaretsizken site bakımda kalıyor, yönetici panelden kapatamıyordu).

export type MaintenanceInfo = {
  enabled: boolean;
  /** Durumu belirleyen kaynak: ortam değişkeni ya da paneldeki ayar */
  source: "env" | "setting";
  envValue: string;
  setting: MaintenanceSettings;
};

export function maintenanceEnv(): "on" | "off" | "" {
  const v = (process.env.MAINTENANCE_MODE ?? "").trim().toLowerCase();
  if (["on", "1", "true", "acik", "açık"].includes(v)) return "on";
  if (["off", "0", "false", "kapali", "kapalı"].includes(v)) return "off";
  return "";
}

export async function maintenanceInfo(): Promise<MaintenanceInfo> {
  const [setting, raw] = await Promise.all([getSetting("maintenance"), getRawSetting<Partial<MaintenanceSettings> | null>("maintenance", null)]);
  const env = maintenanceEnv();
  const savedInPanel = !!raw && typeof raw.enabled === "boolean";
  if (env && !savedInPanel) return { enabled: env === "on", source: "env", envValue: env, setting };
  return { enabled: !!setting.enabled, source: "setting", envValue: env, setting };
}
