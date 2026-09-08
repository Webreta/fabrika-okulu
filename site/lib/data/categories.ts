import "server-only";
import { cache } from "react";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, courseCategories, courses } from "@/db/schema";
import { listCourses } from "@/lib/data/courses";

export type Category = typeof categories.$inferSelect;

/** Tüm kategoriler (sıra + ad), yayındaki eğitim sayısıyla; header/footer/admin ortak */
export const listCategories = cache(async () => {
  const rows = await db
    .select({
      k: categories,
      count: sql<number>`(select count(*) from ${courseCategories} cc join ${courses} c on c.id = cc.course_id where cc.category_id = "categories"."id" and c.status = 'published' and c.closed = false)`.mapWith(Number),
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  return rows.map((r) => ({ ...r.k, count: r.count }));
});

export async function categoryBySlug(slug: string) {
  const [k] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  return k ?? null;
}

/** Kategorideki yayında ve kapalı olmayan eğitimler (katalog kartı verisiyle) */
export async function coursesInCategory(categoryId: number) {
  const ids = (await db.select({ courseId: courseCategories.courseId }).from(courseCategories).where(eq(courseCategories.categoryId, categoryId))).map((r) => r.courseId);
  if (ids.length === 0) return [];
  return (await listCourses({ ids })).filter((c) => !c.closed);
}

/** Kategori → kurs id listesi (admin dağıtım ekranı) */
export async function categoryCourseMap() {
  const rows = await db.select({ categoryId: courseCategories.categoryId, courseId: courseCategories.courseId }).from(courseCategories);
  const map = new Map<number, number[]>();
  for (const r of rows) map.set(r.categoryId, [...(map.get(r.categoryId) ?? []), r.courseId]);
  return map;
}

/** Kursun kategorileri (program sayfası rozetleri) */
export async function courseCategoryList(courseId: number) {
  return db
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(courseCategories)
    .innerJoin(categories, eq(courseCategories.categoryId, categories.id))
    .where(eq(courseCategories.courseId, courseId))
    .orderBy(asc(categories.sortOrder));
}

export async function setCategoryCourses(categoryId: number, courseIds: number[]) {
  const ids = [...new Set(courseIds.filter((x) => x > 0))];
  await db.delete(courseCategories).where(eq(courseCategories.categoryId, categoryId));
  if (ids.length) await db.insert(courseCategories).values(ids.map((courseId) => ({ courseId, categoryId })));
}

export async function categoryIdsForCourses(courseIds: number[]) {
  if (courseIds.length === 0) return new Map<number, number[]>();
  const rows = await db.select({ categoryId: courseCategories.categoryId, courseId: courseCategories.courseId }).from(courseCategories).where(and(inArray(courseCategories.courseId, courseIds)));
  const map = new Map<number, number[]>();
  for (const r of rows) map.set(r.courseId, [...(map.get(r.courseId) ?? []), r.categoryId]);
  return map;
}
