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
  ctaTitle: string;
  ctaText: string;
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
  /** İkincil menü stili: normal (ikon+metin) | icon (büyük ikon, üzerine gelince metin açılır) */
  menuStyle: "normal" | "icon";
  registrationOpen: boolean;
  surveyRequired: boolean;
};

export type PaymentSettings = {
  provider: "iyzico" | "manual";
  bankInfo: string; // havale/EFT bilgileri (manual)
  currency: string;
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
    heroText:
      "İş hayatına doğru başlamak, bireysel rekabet gücünü geliştirmek, kariyerinde başarıyla ilerlemek için ihtiyaç duyduğun yetkinlikleri Fabrika Okulu ile kazan.",
    heroImage: "/img/site/hero.jpg",
    introTitle: "Çağa ayak uyduran yetkinlikler esnek erişimle ekranında.",
    introText:
      "Dünyanın, Avrupa'nın ve Türkiye'nin öncü firmalarının nabzını tutuyor, ihtiyacın olan alanlarda program hazırlıyoruz. 20 yılı aşkın üretim, hizmet ve operasyon tecrübesiyle en yeni uygulamaları harmanlıyoruz.",
    esnekText:
      "Kendine uygun saatlerde online içeriğe ulaşarak çalışmaları tamamla, mentor eğitmenine sorularını sor, programı tamamla.",
    takvimliText:
      "Bir veya daha fazla haftaya yayılan programlar. Haftalık plana uyarak esnek saatlerde online içeriğe ulaş, çalışmaları tamamla, mentor eğitmenle planlı oturumlara katıl, programı tamamla.",
    ctaTitle: "Hazırsan Başlayalım",
    ctaText: "Kariyerin için bir adım at!",
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
    surveyRequired: false,
  } as PanelSettings,
  payment: {
    provider: "iyzico" as PaymentSettings["provider"],
    bankInfo: "",
    currency: "TRY",
  } as PaymentSettings,
  seo: { headCode: "", metaDescription: "" } as SeoSettings,
};

export type SettingsKey = keyof typeof DEFAULTS;
export type SettingsMap = { [K in SettingsKey]: (typeof DEFAULTS)[K] };

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
