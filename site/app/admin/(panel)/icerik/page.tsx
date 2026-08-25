import { asc } from "drizzle-orm";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { getSetting, getRawSetting } from "@/lib/settings";
import { DEFAULT_ABOUT } from "@/lib/content-defaults";
import { PageTitle, Tabs } from "@/components/panel/ui";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { AboutForm, PagesManager } from "@/components/admin/ContentForms";

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ sekme?: string }> }) {
  const { sekme = "anasayfa" } = await searchParams;
  const tabs = [["anasayfa", "Anasayfa"], ["hakkimizda", "Hakkımızda"], ["iletisim", "İletişim"], ["sayfalar", "Yasal Sayfalar"]];
  const [general, contact, about, pageList] = await Promise.all([getSetting("general"), getSetting("contact"), getRawSetting("about", DEFAULT_ABOUT), db.select().from(pages).orderBy(asc(pages.title))]);
  return (
    <>
      <PageTitle title="Site İçeriği" />
      <Tabs items={tabs.map(([k, l]) => ({ href: `/admin/icerik?sekme=${k}`, label: l, active: sekme === k }))} />
      {sekme === "anasayfa" && (
        <SettingsForm settingKey="general" title="Anasayfa metinleri" values={general as unknown as Record<string, string>} fields={[
          { key: "siteName", label: "Site adı", type: "text" }, { key: "tagline", label: "Slogan", type: "text" },
          { key: "heroTitle", label: "Hero başlık", type: "text" }, { key: "heroImage", label: "Hero görseli", type: "image" },
          { key: "heroText", label: "Hero metni", type: "textarea", rows: 3 },
          { key: "introTitle", label: "Tanıtım başlığı", type: "text" }, { key: "introText", label: "Tanıtım metni", type: "textarea", rows: 3 },
          { key: "esnekText", label: "Esnek programlar açıklaması", type: "textarea", rows: 2 }, { key: "takvimliText", label: "Takvimli programlar açıklaması", type: "textarea", rows: 2 },
          { key: "ctaTitle", label: "CTA başlığı", type: "text" }, { key: "ctaText", label: "CTA metni", type: "text" },
          { key: "footerText", label: "Footer metni", type: "textarea", rows: 2 },
        ]} />
      )}
      {sekme === "hakkimizda" && <AboutForm about={about} />}
      {sekme === "iletisim" && (
        <SettingsForm settingKey="contact" title="İletişim bilgileri" values={contact as unknown as Record<string, string | string[]>} fields={[
          { key: "phones", label: "Telefonlar (her satıra bir)", type: "list" }, { key: "whatsapps", label: "WhatsApp numaraları (her satıra bir)", type: "list" },
          { key: "email", label: "E-posta", type: "text" }, { key: "address", label: "Adres", type: "textarea", rows: 4 },
          { key: "whatsappNumber", label: "Kurs sayfası WhatsApp numarası", type: "text", hint: "Ülke kodu ile, + olmadan: 905321234567" },
          { key: "whatsappMessage", label: "WhatsApp mesaj şablonu", type: "text", hint: "{course_name} ve {course_price} kullanılabilir" },
          { key: "instagram", label: "Instagram", type: "text" }, { key: "linkedin", label: "LinkedIn", type: "text" }, { key: "youtube", label: "YouTube", type: "text" },
          { key: "mapEmbed", label: "Harita embed (iframe)", type: "textarea", rows: 3 },
        ]} />
      )}
      {sekme === "sayfalar" && <PagesManager pages={pageList.map((p) => ({ id: p.id, slug: p.slug, title: p.title, html: p.html, published: p.published }))} />}
    </>
  );
}
