import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { catalogCourses } from "@/lib/data/courses";
import { getSetting } from "@/lib/settings";
import { groupFromSlug, GROUP_LABELS } from "@/lib/course-logic";
import { CourseCard } from "@/components/site/CourseCard";
import { PageHero, CtaBand } from "@/components/site/Sections";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { eq } from "drizzle-orm";

// /esnek-programlar, /takvimli-programlar, /ucretsiz-kaynaklar  → katalog
// diğer slug'lar → yasal / serbest sayfalar (pages tablosu)

const GROUP_SUB: Record<string, string> = {
  esnek: "Kendine uygun saatlerde online içeriğe ulaş, çalışmaları tamamla, mentor eğitmenine sorularını sor.",
  takvimli: "Haftalık plana uyarak online içeriğe ulaş, mentor eğitmenle planlı oturumlara katıl.",
  ucretsiz: "Ücretsiz kaynaklarla gelişimine hemen başla.",
};

export async function generateMetadata({ params }: { params: Promise<{ grup: string }> }): Promise<Metadata> {
  const { grup } = await params;
  const g = groupFromSlug(grup);
  if (g) return { title: GROUP_LABELS[g] };
  const [p] = await db.select({ title: pages.title }).from(pages).where(eq(pages.slug, grup)).limit(1);
  return { title: p?.title ?? "Sayfa" };
}

export default async function GroupOrPage({ params }: { params: Promise<{ grup: string }> }) {
  const { grup } = await params;
  const g = groupFromSlug(grup);
  const general = await getSetting("general");

  if (g) {
    const list = await catalogCourses(g);
    return (
      <>
        <PageHero title={GROUP_LABELS[g]} subtitle={GROUP_SUB[g]} />
        <section className="mx-auto max-w-7xl px-4 py-14">
          {list.length === 0 ? (
            <p className="text-center text-muted">Bu kategoride henüz program yok.</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((c) => <CourseCard key={c.id} course={c} />)}
            </div>
          )}
        </section>
        <CtaBand title={general.ctaTitle} text={general.ctaText} />
      </>
    );
  }

  const [page] = await db.select().from(pages).where(eq(pages.slug, grup)).limit(1);
  if (!page || !page.published) notFound();
  return (
    <>
      <section className="bg-surface border-b border-line">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <h1 className="text-3xl font-bold text-navy-800 md:text-4xl">{page.title}</h1>
        </div>
      </section>
      <article className="prose-fabo mx-auto max-w-4xl px-4 py-10" dangerouslySetInnerHTML={{ __html: page.html }} />
      <CtaBand title={general.ctaTitle} text={general.ctaText} />
    </>
  );
}
