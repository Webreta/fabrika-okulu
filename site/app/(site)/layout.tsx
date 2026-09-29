import type { Metadata } from "next";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { getCurrentUser } from "@/lib/auth/session";
import { getCart } from "@/lib/cart";
import { getSetting, getRawSetting } from "@/lib/settings";
import { DEFAULT_FOOTER, type FooterContent } from "@/lib/content-defaults";
import { listCategories } from "@/lib/data/categories";
import { publicRoutes } from "@/lib/data/routes";
import { maintenanceInfo } from "@/lib/maintenance";
import { pageMeta } from "@/lib/seo";

// Varsayılan sayfa açıklaması: Ayarlar → SEO → "Site açıklaması". Kendi açıklaması olan sayfalar (eğitim, kategori…) bunu ezer;
// alan boşsa kök layout'taki sabit açıklama geçerlidir.
// Paylaşım önizlemesi (og:/twitter:) varsayılanları da aynı açıklamayı kullanır; sayfalar kendi etiketlerini pageMeta ile üretir.
export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSetting("seo");
  const description = (seo.metaDescription ?? "").trim();
  if (!description) return {};
  return pageMeta();
}

export default async function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [user, cart, general, seo, categories, contact, footerRaw] = await Promise.all([
    getCurrentUser(),
    getCart(),
    getSetting("general"),
    getSetting("seo"),
    listCategories(),
    getSetting("contact"),
    getRawSetting<Partial<FooterContent> | null>("footer", null),
  ]);
  // Footer ayarı hiç kaydedilmediyse kısa metin eski "Footer metni"nden gelir; kaydedildiyse (boş bile olsa) yeni değer geçerlidir
  const footer: FooterContent = { ...DEFAULT_FOOTER, text: general.footerText, ...(footerRaw ?? {}) };
  const routes = await publicRoutes();
  // Bakım modunda siteyi yalnızca yönetici görür; gördüğü şeyin ziyaretçiye kapalı olduğunu hatırlatan şerit
  const bakim = user?.role === "admin" ? await maintenanceInfo() : null;
  const cats = categories.map((k) => ({ name: k.name, slug: k.slug }));
  const rts = routes.map((r) => ({ name: r.name, slug: r.slug }));
  return (
    <>
      {bakim?.enabled && (
        <a href="/admin/ayarlar?sekme=bakim" className="block bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold text-[#0b1220]">
          Bakım modu açık: bu sayfayı yalnızca yöneticiler görüyor, ziyaretçiler bakım sayfasını görüyor.
        </a>
      )}
      <Header user={user ? { name: user.name, role: user.role } : null} cartCount={cart.length} categories={cats} routes={rts} />
      <main className="min-h-[60vh]">{children}</main>
      <Footer content={footer} categories={cats} contact={{ phones: contact.phones, whatsapps: contact.whatsapps, email: contact.email, instagram: contact.instagram, linkedin: contact.linkedin, youtube: contact.youtube }} />
      {seo.headCode && <div dangerouslySetInnerHTML={{ __html: seo.headCode }} />}
    </>
  );
}
