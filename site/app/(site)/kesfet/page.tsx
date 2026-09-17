import type { Metadata } from "next";
import { catalogCourses } from "@/lib/data/courses";
import { CourseCard } from "@/components/site/CourseCard";
import { PageHero } from "@/components/site/Sections";

export const metadata: Metadata = { title: "Keşfet" };

export default async function KesfetPage() {
  const list = await catalogCourses();
  return (
    <>
      <PageHero title="Gelişim Programlarını Keşfet" subtitle="Kendi hızında ya da takvimli: hedefine uygun programı seç." crumbs={[{ label: "Eğitimler" }]} />
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
