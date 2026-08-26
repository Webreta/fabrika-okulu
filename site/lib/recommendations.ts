import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { courseRelations, courses, enrollments } from "@/db/schema";
import { courseProgress } from "@/lib/data/student";
import { effectivePrice } from "@/lib/course-logic";

export type Recommendation = {
  courseId: number;
  slug: string;
  title: string;
  imageUrl: string;
  group: string;
  /** Önerinin kaynağı */
  sourceTitle: string;
  trigger: "completed" | "purchased";
  discountPercent: number;
  note: string;
  /** Kursun normal (kampanyalı) fiyatı ve kişisel indirim sonrası fiyat */
  price: number;
  finalPrice: number;
};

/**
 * Öğrencinin tetiklenmiş kurs ilişkileri:
 * - "completed" ilişkisi → kaynak kursun ilerlemesi %100 ise
 * - "purchased" ilişkisi → kaynak kursa aktif kaydı varsa
 * Öğrencinin zaten kayıtlı olduğu / yayında olmayan hedefler elenir.
 */
async function triggeredRelations(userId: number) {
  const enr = await db
    .select({ courseId: enrollments.courseId })
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.status, "active")));
  const owned = new Set(enr.map((e) => e.courseId));
  if (owned.size === 0) return { owned, relations: [] as (typeof courseRelations.$inferSelect)[], completed: new Set<number>() };

  const relations = await db.select().from(courseRelations).where(inArray(courseRelations.courseId, [...owned]));
  if (relations.length === 0) return { owned, relations: [], completed: new Set<number>() };

  // Tamamlanma yalnızca "completed" ilişkisi olan kaynaklar için hesaplanır
  const needCompletion = [...new Set(relations.filter((r) => r.trigger === "completed").map((r) => r.courseId))];
  const completed = new Set<number>();
  for (const cid of needCompletion) {
    const p = await courseProgress(userId, cid);
    if (p.total > 0 && p.completed >= p.total) completed.add(cid);
  }
  const active = relations.filter((r) =>
    !owned.has(r.relatedCourseId) && (r.trigger === "purchased" ? true : completed.has(r.courseId))
  );
  return { owned, relations: active, completed };
}

/** Sepet/satın alma için: kullanıcıya bu kursta tanımlı en yüksek kişisel indirim yüzdesi */
export async function personalDiscountPercent(userId: number, courseId: number): Promise<number> {
  const { relations } = await triggeredRelations(userId);
  return relations
    .filter((r) => r.relatedCourseId === courseId)
    .reduce((max, r) => Math.max(max, r.discountPercent), 0);
}

/**
 * Panel tanıtım alanı için öneriler.
 * Öncelik: kurs bitirme ilişkileri önce, sonra satın alma ilişkileri; hedef başına tek kart
 * (bitirme > satın alma; eşitse yüksek indirim kazanır).
 */
export async function studentRecommendations(userId: number): Promise<Recommendation[]> {
  const { relations } = await triggeredRelations(userId);
  if (relations.length === 0) return [];

  const targetIds = [...new Set(relations.map((r) => r.relatedCourseId))];
  const sourceIds = [...new Set(relations.map((r) => r.courseId))];
  const cs = await db.select().from(courses).where(inArray(courses.id, [...new Set([...targetIds, ...sourceIds])]));
  const courseOf = (id: number) => cs.find((c) => c.id === id);

  const byTarget = new Map<number, (typeof relations)[number]>();
  for (const r of relations) {
    const cur = byTarget.get(r.relatedCourseId);
    const better =
      !cur ||
      (r.trigger === "completed" && cur.trigger === "purchased") ||
      (r.trigger === cur.trigger && r.discountPercent > cur.discountPercent);
    if (better) byTarget.set(r.relatedCourseId, r);
  }

  const list: Recommendation[] = [];
  for (const r of byTarget.values()) {
    const target = courseOf(r.relatedCourseId);
    const source = courseOf(r.courseId);
    if (!target || !source || target.status !== "published" || target.closed) continue;
    const price = effectivePrice(target);
    const pct = Math.max(0, Math.min(100, r.discountPercent));
    const finalPrice = target.isFree ? 0 : Math.round(price * (1 - pct / 100) * 100) / 100;
    list.push({
      courseId: target.id,
      slug: target.slug,
      title: target.title,
      imageUrl: target.imageUrl,
      group: target.group,
      sourceTitle: source.title,
      trigger: r.trigger as "completed" | "purchased",
      discountPercent: pct,
      note: r.note,
      price,
      finalPrice,
    });
  }
  // Bitirme kaynaklı öneriler önce, sonra tanımlanan sıraya göre
  const order = (t: Recommendation) => (t.trigger === "completed" ? 0 : 1);
  list.sort((a, b) => order(a) - order(b) || b.discountPercent - a.discountPercent);
  return list;
}
