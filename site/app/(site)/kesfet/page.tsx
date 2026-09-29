import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { catalogCourses } from "@/lib/data/courses";
import { getRawSetting } from "@/lib/settings";
import { DEFAULT_CATALOG, type CatalogContent } from "@/lib/content-defaults";
import { CourseCard } from "@/components/site/CourseCard";
import { PageHero } from "@/components/site/Sections";

export const generateMetadata = (): Promise<Metadata> => pageMeta({ title: "Keşfet", path: "/kesfet" });

// Başlık ve alt metin admin → Kategoriler → "Tüm Eğitimler" satırından düzenlenir (ayar anahtarı: catalog)
export default async function KesfetPage() {
  const [list, page] = await Promise.all([
    catalogCourses(),
    getRawSetting<CatalogContent>("catalog", DEFAULT_CATALOG).then((v) => ({ ...DEFAULT_CATALOG, ...v })),
  ]);
  return (
    <>
      <PageHero title={page.title || DEFAULT_CATALOG.title} subtitle={page.sub || undefined} crumbs={[{ label: "Eğitimler" }]} />
      <section className="mx-auto max-w-7xl px-4 py-14">
        {list.length === 0 ? (
          <p className="text-center text-muted">Henüz program yok.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => <CourseCard key={c.id} course={c} />)}
          </div>
        )}
      </section>
    </>
  );
}
