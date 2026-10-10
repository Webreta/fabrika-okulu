import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";

// Anahtar-değer site ayarları (jsonb). Tüm ayarlar burada tek tabloda tutulur.

export type GeneralSettings = {
  siteName: string;
  tagline: string;
  heroTitle: string;
  heroText: string;
  heroImage: string;
  introTitle: string;
  introText: string;
  esnekText: string;
  takvimliText: string;
  footerText: string;
  primaryColor: string;
};

export type ContactSettings = {
  phones: string[];
  whatsapps: string[];
  email: string;
  address: string;
  mapEmbed: string;
  whatsappNumber: string; // kurs sayfası WhatsApp butonu (ülke kodu, + yok)
  whatsappMessage: string;
  instagram: string;
  linkedin: string;
  youtube: string;
};

export type SmtpSettings = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  adminEmails: string; // virgülle ayrılmış
  documentsEmail: string;
  reportEmail: string;
  dailyReportEnabled: boolean;
  emailsMuted: boolean;
};

export type MailTemplateSettings = Record<
  string,
  { enabled: boolean; subject: string }
>;

export type PanelSettings = {
  appName: string;
  iconUrl: string;
  loginBg: string;
  loginLogo: string;
  defaultTheme: string;
  /** İkincil menü stili: normal (ikon+metin) | icon (büyük ikon, üzerine gelince metin yana açılır) | tooltip (sabit ikon, üzerine gelince adı altında baloncukta belirir) */
  menuStyle: "normal" | "icon" | "tooltip";
  registrationOpen: boolean;
  /** Geçilen sınavın sonuç listesinde soru açıklamaları gösterilsin mi (kapalıysa yalnızca doğru/yanlış) */
  quizExplanations: boolean;
};

export type PaymentSettings = {
  provider: "iyzico" | "paytr" | "manual";
  bankInfo: string; // havale/EFT bilgileri (manual)
  currency: string;
  /** PayTR mağaza bilgileri (panelden girilir; boşsa PAYTR_* ortam değişkenleri kullanılır). key/salt gizli alan. */
  paytrMerchantId: string;
  paytrKey: string;
  paytrSalt: string;
  paytrTestMode: boolean;
};

/** Bakım modu (dışarıya gösterme): açıkken siteyi yalnızca giriş yapmış yöneticiler görür (lib/maintenance.ts, middleware.ts) */
export type MaintenanceSettings = {
  enabled: boolean;
  title: string;
  message: string;
};

export type SeoSettings = {
  headCode: string;
  metaDescription: string;
};

const DEFAULTS = {
  general: {
    siteName: "Fabrika Okulu",
    tagline: "Kariyer gelişiminde yol arkadaşın.",
    heroTitle: "Kariyer gelişiminde yol arkadaşın.",
    heroText: "Kariyerinde öne çıkaracak yetkinlikleri Fabrika Okulu ile kazan.",
    heroImage: "/img/site/hero.jpg",
    introTitle: "Çağa ayak uyduran yetkinlikler esnek erişimle ekranında.",
    introText:
      "Dünyanın, Avrupa'nın ve Türkiye'nin öncü firmalarının nabzını tutuyor, ihtiyacın olan alanlarda program hazırlıyoruz. 20 yılı aşkın üretim, hizmet ve operasyon tecrübesiyle en yeni uygulamaları harmanlıyoruz.",
    esnekText:
      "Kendine uygun saatlerde online içeriğe ulaşarak çalışmaları tamamla, mentor eğitmenine sorularını sor, programı tamamla.",
    takvimliText:
      "Bir veya daha fazla haftaya yayılan programlar. Haftalık plana uyarak esnek saatlerde online içeriğe ulaş, çalışmaları tamamla, mentor eğitmenle planlı oturumlara katıl, programı tamamla.",
    footerText:
      "Fabrika Okulu ile, ihtiyaç duyacağın yetkinliklerde kavramsal farkındalık kazan, örnek çalışmalarla pratiği gör, uygulama ve takip planı yaparak gelişimini sürdür.",
    primaryColor: "#142b56",
  } as GeneralSettings,
  contact: {
    phones: ["0 850 723 19 25", "0 232 234 00 35"],
    whatsapps: ["0 532 341 2770", "0 505 610 0759"],
    email: "info@uretmer.com.tr",
    address:
      "ÜRETMER Danışmanlık Yazılım\nİzQ Girişimcilik Merkezi\nAkdeniz Mah. Cumhuriyet Blv. No:120\n35210 Konak – İzmir",
    mapEmbed: "",
    whatsappNumber: "905323412770",
    whatsappMessage: "Merhaba, {course_name} programı hakkında bilgi almak istiyorum.",
    instagram: "",
    linkedin: "",
    youtube: "",
  } as ContactSettings,
  smtp: {
    host: "",
    port: 587,
    user: "",
    pass: "",
    from: "",
    adminEmails: "",
    documentsEmail: "",
    reportEmail: "",
    dailyReportEnabled: true,
    emailsMuted: false,
  } as SmtpSettings,
  mailTemplates: {} as MailTemplateSettings,
  panel: {
    appName: "Fabrika Okulu",
    iconUrl: "/img/panel-icon.png",
    loginBg: "",
    loginLogo: "",
    defaultTheme: "aydinlik",
    menuStyle: "icon",
    registrationOpen: true,
    quizExplanations: true,
  } as PanelSettings,
  payment: {
    provider: "iyzico" as PaymentSettings["provider"],
    bankInfo: "",
    currency: "TRY",
    paytrMerchantId: "",
    paytrKey: "",
    paytrSalt: "",
    paytrTestMode: true,
  } as PaymentSettings,
  seo: { headCode: "", metaDescription: "" } as SeoSettings,
  maintenance: {
    enabled: false,
    title: "Çok yakında buradayız",
    message: "Sitemizde çalışma yapıyoruz. Kısa süre içinde yeniden yayında olacağız.",
  } as MaintenanceSettings,
};

export type SettingsKey = keyof typeof DEFAULTS;
export type SettingsMap = { [K in SettingsKey]: (typeof DEFAULTS)[K] };

/** Tarayıcıya asla gönderilmeyen gizli alanlar (ayar anahtarı → alan adları). Yeni gizli alan eklenince buraya yazılır. */
export const SECRET_FIELDS: Partial<Record<SettingsKey, string[]>> = { smtp: ["pass"], payment: ["paytrKey", "paytrSalt"] };

/**
 * Ayarın istemciye (form bileşenine) gidecek kopyası: gizli alanlar boşaltılır,
 * hangilerinin kayıtlı olduğu `saved` içinde döner. Kayıtta boş gelen gizli alan mevcut değeri korur (`saveSettings`).
 */
export function settingForClient<K extends SettingsKey>(key: K, value: SettingsMap[K]) {
  const values = { ...value } as Record<string, unknown>;
  const saved: Record<string, boolean> = {};
  for (const f of SECRET_FIELDS[key] ?? []) {
    saved[f] = typeof values[f] === "string" && values[f] !== "";
    values[f] = "";
  }
  return { values: values as Record<string, string | number | boolean | string[]>, saved };
}

export const getSetting = cache(
  async <K extends SettingsKey>(key: K): Promise<SettingsMap[K]> => {
    const rows = await db
      .select({ value: siteSettings.value })
      .from(siteSettings)
      .where(eq(siteSettings.key, key))
      .limit(1);
    const stored = (rows[0]?.value ?? {}) as Partial<SettingsMap[K]>;
    return { ...(DEFAULTS[key] as SettingsMap[K]), ...stored };
  }
);

export async function setSetting<K extends SettingsKey>(key: K, value: Partial<SettingsMap[K]>) {
  const current = await getSetting(key);
  const merged = { ...current, ...value };
  await db
    .insert(siteSettings)
    .values({ key, value: merged, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value: merged, updatedAt: new Date() },
    });
}

export async function getRawSetting<T>(key: string, fallback: T): Promise<T> {
  const rows = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, key))
    .limit(1);
  return (rows[0]?.value as T) ?? fallback;
}

export async function setRawSetting(key: string, value: unknown) {
  await db
    .insert(siteSettings)
    .values({ key, value: value as object, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value: value as object, updatedAt: new Date() },
    });
}
