import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { getRawSetting } from "@/lib/settings";
import { DEFAULT_ABOUT } from "@/lib/content-defaults";
import { PageHero } from "@/components/site/Sections";

export const generateMetadata = (): Promise<Metadata> => pageMeta({ title: "Hakkımızda", path: "/hakkimizda" });

export default async function AboutPage() {
  const about = await getRawSetting("about", DEFAULT_ABOUT);
  return (
    <>
      <PageHero title="Hakkımızda" subtitle="Üretim ve operasyon tecrübesini kariyerine taşıyan bir ekip." crumbs={[{ label: "Hakkımızda" }]} />
      <section className="mx-auto max-w-4xl px-4 py-14">
        <h2 className="text-2xl font-bold text-navy-800 md:text-3xl">{about.title}</h2>
        <div className="prose-fabo mt-4 text-lg" dangerouslySetInnerHTML={{ __html: about.html }} />
      </section>
    </>
  );
}
