import "server-only";
import type { Metadata } from "next";
import { getSetting } from "@/lib/settings";

export const SITE_NAME = "Fabrika Okulu";
export const DEFAULT_DESCRIPTION = "Kariyer gelişiminde yol arkadaşın. Esnek ve takvimli online gelişim programları.";
/** Paylaşım önizlemesinde kullanılan varsayılan görsel (1200x630) */
export const DEFAULT_OG_IMAGE = "/img/site/og.jpg";

/** Sitenin kök adresi (paylaşım etiketlerindeki göreli adresler buna göre tamamlanır) */
export function siteBase() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

/** Varsayılan site açıklaması: Ayarlar → SEO → "Site açıklaması", boşsa sabit metin */
export async function siteDescription() {
  const seo = await getSetting("seo");
  return (seo.metaDescription ?? "").trim() || DEFAULT_DESCRIPTION;
}

/**
 * Sayfa başlığı/açıklaması + paylaşım önizlemesi etiketleri (og:title, og:description, og:image, twitter:card).
 * Next.js'te sayfanın openGraph tanımı üst layout'takinin yerine geçer; bu yüzden her sayfa kendi etiketlerini
 * bu yardımcıyla eksiksiz üretir. title verilmezse site adı, description verilmezse site açıklaması, image verilmezse
 * varsayılan paylaşım görseli kullanılır.
 */
export async function pageMeta(opts: { title?: string; description?: string | null; path?: string; image?: string | null; noindex?: boolean } = {}): Promise<Metadata> {
  const description = (opts.description ?? "").trim().slice(0, 300) || (await siteDescription());
  const full = opts.title ? `${opts.title} – ${SITE_NAME}` : SITE_NAME;
  const image = opts.image || DEFAULT_OG_IMAGE;
  return {
    ...(opts.title ? { title: opts.title } : {}),
    description,
    ...(opts.path ? { alternates: { canonical: opts.path } } : {}),
    ...(opts.noindex ? { robots: { index: false } } : {}),
    openGraph: { type: "website", siteName: SITE_NAME, locale: "tr_TR", title: full, description, ...(opts.path ? { url: opts.path } : {}), images: [{ url: image }] },
    twitter: { card: "summary_large_image", title: full, description, images: [image] },
  };
}
