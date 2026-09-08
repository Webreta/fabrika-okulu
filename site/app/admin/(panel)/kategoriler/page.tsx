import { db } from "@/db";
import { courses } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageTitle } from "@/components/panel/ui";
import { CategoriesManager } from "@/components/admin/CategoriesManager";
import { listCategories, categoryCourseMap } from "@/lib/data/categories";

export default async function CategoriesPage() {
  const [cats, map, list] = await Promise.all([
    listCategories(),
    categoryCourseMap(),
    db.select({ id: courses.id, title: courses.title, group: courses.group, status: courses.status }).from(courses).orderBy(asc(courses.title)),
  ]);
  return (
    <>
      <PageTitle title="Kategoriler" sub="Sitenin üst menüsündeki “Eğitimler” açılır listesi bu kategorilerden oluşur. Bir eğitim birden fazla kategoride yer alabilir; dağıtımı buradan ya da kurs editöründen yaparsın." />
      <CategoriesManager initial={cats.map((k) => ({ id: k.id, name: k.name, slug: k.slug, description: k.description, sortOrder: k.sortOrder, count: k.count, courseIds: map.get(k.id) ?? [] }))} courses={list} />
    </>
  );
}
