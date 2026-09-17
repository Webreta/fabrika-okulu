"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { surveyCourses, surveys } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import type { ActionResult } from "@/app/actions/teacher";

/** Anketin bağlı olduğu eğitim listesini baştan yazar (admin). */
export async function saveSurveyCourses(surveyId: number, courseIds: number[]): Promise<ActionResult> {
  await requireAdmin();
  const [s] = await db.select({ id: surveys.id }).from(surveys).where(eq(surveys.id, surveyId)).limit(1);
  if (!s) return { ok: false, error: "Anket bulunamadı." };
  const ids = [...new Set(courseIds.filter((n) => Number.isInteger(n) && n > 0))];
  await db.transaction(async (tx) => {
    await tx.delete(surveyCourses).where(eq(surveyCourses.surveyId, surveyId));
    if (ids.length) await tx.insert(surveyCourses).values(ids.map((courseId) => ({ surveyId, courseId })));
  });
  revalidatePath("/admin/anketler");
  revalidatePath("/kesfet");
  return { ok: true, message: ids.length ? `${ids.length} eğitime bağlandı.` : "Bağlı eğitim kalmadı." };
}
