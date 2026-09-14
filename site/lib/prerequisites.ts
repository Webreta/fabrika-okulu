import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { coursePrerequisites, courses } from "@/db/schema";
import { hasAccess, courseProgress } from "@/lib/data/student";

export type PrereqCondition = "enrolled" | "completed";

export type PrereqLink = {
  courseId: number;
  requiredCourseId: number;
  condition: PrereqCondition;
  requiredTitle: string;
  requiredSlug: string;
};

export const CONDITION_LABELS: Record<PrereqCondition, string> = {
  enrolled: "satın almış olmalı",
  completed: "tamamlamış olmalı",
};

/** Tüm ön koşul bağları (kurs → ön koşul kursu). İstek başına bir kez okunur. */
export const listPrerequisites = cache(async (): Promise<PrereqLink[]> => {
  const rows = await db
    .select({ courseId: coursePrerequisites.courseId, requiredCourseId: coursePrerequisites.requiredCourseId, condition: coursePrerequisites.condition, requiredTitle: courses.title, requiredSlug: courses.slug })
    .from(coursePrerequisites)
    .innerJoin(courses, eq(coursePrerequisites.requiredCourseId, courses.id));
  return rows.map((r) => ({ ...r, condition: (r.condition === "completed" ? "completed" : "enrolled") as PrereqCondition }));
});

/** Kurs id → ön koşul bağı */
export async function prerequisiteMap() {
  const list = await listPrerequisites();
  return new Map(list.map((l) => [l.courseId, l]));
}

export async function prerequisiteFor(courseId: number): Promise<PrereqLink | null> {
  return (await prerequisiteMap()).get(courseId) ?? null;
}

export type PrereqCheck =
  | { ok: true }
  | { ok: false; required: { id: number; title: string; slug: string }; condition: PrereqCondition; message: string };

/**
 * Satın alma ön koşulu sağlanıyor mu?
 * - enrolled: ön koşul kursuna kayıtlı ya da (aynı sepette) ön koşul kursu da sepette
 * - completed: ön koşul kursu %100 tamamlanmış
 * Yalnızca bir üst basamak kontrol edilir; üst basamağın kendi koşulu onun satın alımında zaten uygulanmıştır.
 */
export async function checkPrerequisite(opts: { userId: number | null; courseId: number; cartCourseIds?: number[] }): Promise<PrereqCheck> {
  const link = await prerequisiteFor(opts.courseId);
  if (!link) return { ok: true };
  const required = { id: link.requiredCourseId, title: link.requiredTitle, slug: link.requiredSlug };
  const fail = (message: string): PrereqCheck => ({ ok: false, required, condition: link.condition, message });
  if (link.condition === "enrolled") {
    if (opts.cartCourseIds?.includes(link.requiredCourseId)) return { ok: true };
    if (opts.userId && (await hasAccess(opts.userId, link.requiredCourseId))) return { ok: true };
    return fail(`Bu eğitimi almak için önce "${link.requiredTitle}" eğitimini almalısın.`);
  }
  if (opts.userId && (await hasAccess(opts.userId, link.requiredCourseId))) {
    const p = await courseProgress(opts.userId, link.requiredCourseId);
    if (p.percent >= 100) return { ok: true };
    return fail(`Bu eğitimi almak için önce "${link.requiredTitle}" eğitimini tamamlamalısın (şu an %${p.percent}).`);
  }
  return fail(`Bu eğitimi almak için önce "${link.requiredTitle}" eğitimini tamamlamalısın.`);
}
