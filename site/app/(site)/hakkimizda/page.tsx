import type { Metadata } from "next";
import { getSetting, getRawSetting } from "@/lib/settings";
import { DEFAULT_ABOUT } from "@/lib/content-defaults";
import { PageHero, CtaBand } from "@/components/site/Sections";

export const metadata: Metadata = { title: "Hakkımızda" };

export default async function AboutPage() {
  const [g, about] = await Promise.all([getSetting("general"), getRawSetting("about", DEFAULT_ABOUT)]);
  return (
    <>
      <PageHero title="Hakkımızda" />
      <section className="mx-auto max-w-4xl px-4 py-14">
        <h2 className="text-2xl font-bold text-navy-800 md:text-3xl">{about.title}</h2>
        <div className="prose-fabo mt-4 text-lg" dangerouslySetInnerHTML={{ __html: about.html }} />
      </section>
      <CtaBand title={g.ctaTitle} text={g.ctaText} />
    </>
  );
}
