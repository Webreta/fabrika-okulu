import "server-only";
import { getSetting, type MaintenanceSettings } from "@/lib/settings";

// Bakım modu (dışarıya gösterme): açıkken siteyi yalnızca giriş yapmış yöneticiler görür.
// Engelleme middleware.ts içinde yapılır; middleware veritabanına erişemediği için durumu /api/bakim ucundan sorar.
// Öncelik: MAINTENANCE_MODE ortam değişkeni (on/off) → Yönetim → Ayarlar → Bakım modu.

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
  const setting = await getSetting("maintenance");
  const env = maintenanceEnv();
  if (env) return { enabled: env === "on", source: "env", envValue: env, setting };
  return { enabled: !!setting.enabled, source: "setting", envValue: "", setting };
}
