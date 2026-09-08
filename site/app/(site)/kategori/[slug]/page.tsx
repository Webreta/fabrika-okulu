import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { categoryBySlug, coursesInCategory, listCategories } from "@/lib/data/categories";
import { getSetting } from "@/lib/settings";
import { CourseCard } from "@/components/site/CourseCard";
import { PageHero, CtaBand } from "@/components/site/Sections";

// /kategori/[slug] → admin'in tanımladığı kategorideki eğitimler (header "Eğitimler" menüsü buraya gelir)

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const k = await categoryBySlug(slug);
  return { title: k?.name ?? "Kategori", description: k?.description || undefined };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const k = await categoryBySlug(slug);
  if (!k) notFound();
  const [list, all, general] = await Promise.all([coursesInCategory(k.id), listCategories(), getSetting("general")]);
  return (
    <>
      <PageHero title={k.name} subtitle={k.description || undefined} />
      <section className="mx-auto max-w-7xl px-4 py-14">
        {all.length > 1 && (
          <div className="mb-8 flex flex-wrap gap-2">
            {all.map((c) => (
              <Link key={c.id} href={`/kategori/${c.slug}`} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${c.id === k.id ? "border-navy-800 bg-navy-800 text-white" : "border-line bg-white text-navy-800 hover:border-navy-300"}`}>
                {c.name}{c.count > 0 && <span className={`ml-1.5 text-xs ${c.id === k.id ? "text-white/70" : "text-muted"}`}>{c.count}</span>}
              </Link>
            ))}
          </div>
        )}
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
