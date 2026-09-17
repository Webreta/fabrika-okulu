import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { surveyCourses, surveys } from "@/db/schema";
import { completedSurveyKeys } from "@/lib/survey";

/** Eğitime bağlı, yayındaki anket (satın alma öncesi doldurulması gereken hedef testi) */
export type SurveyGate = { courseId: number; surveyId: number; surveyKey: string; title: string };

/** Tüm anket–eğitim bağları (yalnızca yayındaki anketler). İstek başına bir kez okunur. */
export const listSurveyGates = cache(async (): Promise<SurveyGate[]> => {
  return db
    .select({ courseId: surveyCourses.courseId, surveyId: surveyCourses.surveyId, surveyKey: surveys.key, title: surveys.title })
    .from(surveyCourses)
    .innerJoin(surveys, eq(surveyCourses.surveyId, surveys.id))
    .where(eq(surveys.status, "published"));
});

/** Kurs id → bağlı anketler */
export async function surveyGateMap() {
  const m = new Map<number, SurveyGate[]>();
  for (const g of await listSurveyGates()) m.set(g.courseId, [...(m.get(g.courseId) ?? []), g]);
  return m;
}

export type SurveyGateCheck =
  | { ok: true }
  | { ok: false; survey: { id: number; title: string }; message: string };

/**
 * Eğitime bağlı anket(ler) dolduruldu mu? Yalnızca giriş yapmış kullanıcı için engel oluşturur;
 * misafir önce girişe yönlendirilir, kontrol girişten sonraki denemede uygulanır.
 * Birden fazla bağlı anket varsa ilk doldurulmamış olan bildirilir.
 */
export async function checkSurveyGate(opts: { userId: number | null; courseId: number }): Promise<SurveyGateCheck> {
  const gates = (await surveyGateMap()).get(opts.courseId) ?? [];
  if (!gates.length || !opts.userId) return { ok: true };
  const done = await completedSurveyKeys(opts.userId);
  const missing = gates.find((g) => !done.has(g.surveyKey));
  if (!missing) return { ok: true };
  return { ok: false, survey: { id: missing.surveyId, title: missing.title }, message: `Bu eğitimi almadan önce "${missing.title}" hedef testini doldurmalısın.` };
}

/** Admin: bir anketin bağlı olduğu eğitim id'leri (taslak anket dahil) */
export async function surveyCourseIds(surveyId: number): Promise<number[]> {
  const rows = await db.select({ courseId: surveyCourses.courseId }).from(surveyCourses).where(eq(surveyCourses.surveyId, surveyId));
  return rows.map((r) => r.courseId);
}
