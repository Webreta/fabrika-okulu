import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { getRawSetting } from "@/lib/settings";
import { DEFAULT_FAQ, type FaqContent } from "@/lib/content-defaults";
import { PageHero } from "@/components/site/Sections";
import { FaqAccordion } from "@/components/site/FaqAccordion";

export const generateMetadata = (): Promise<Metadata> => pageMeta({ title: "Sıkça Sorulan Sorular", description: "Programlar, katılım, ödeme ve sertifika hakkında merak edilenler.", path: "/sss" });

/** S.S.S.: admin Site İçeriği → S.S.S. sekmesindeki tüm sorular (anasayfada yalnızca ilk homeLimit soru görünür) */
export default async function FaqPage() {
  const raw = await getRawSetting<FaqContent>("faq", DEFAULT_FAQ);
  const faq = { ...DEFAULT_FAQ, ...raw };
  return (
    <>
      <PageHero title="Sıkça Sorulan Sorular" subtitle={faq.sub} crumbs={[{ label: "S.S.S." }]} />
      <section className="mx-auto max-w-7xl px-4 py-14">
        {faq.items.length === 0 ? (
          <p className="text-center text-muted">Henüz soru eklenmedi.</p>
        ) : (
          <FaqAccordion items={faq.items} />
        )}
        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-line bg-surface p-6 text-center">
          <p className="font-bold text-navy-800">Sorunun cevabını bulamadın mı?</p>
          <p className="mt-1 text-sm text-muted">Bize yaz, en kısa sürede dönelim.</p>
          <Link href="/iletisim" className="btn-primary mt-4">İletişime geç</Link>
        </div>
      </section>
    </>
  );
}
