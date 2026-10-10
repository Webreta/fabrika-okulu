import "server-only";
import { and, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import { enrollments, quizzes, assignments, quizAttempts, assignmentSubmissions, quizQuestions, questions, questionAnswers, users } from "@/db/schema";
import { getCourseFull } from "@/lib/data/courses";
import { lessonSets, getEnrollment, studentTaskBase } from "@/lib/data/student";
import { computeProgress, computeFrontier, taskDue, deadlineOf, quizStanding, attemptPassed, type QuizReviewItem } from "@/lib/course-logic";
import { getSetting } from "@/lib/settings";
import type { QuizQuestion } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ownsCourse } from "@/lib/data/teacher";
import { courses } from "@/db/schema";
import { awaitsOpening } from "@/lib/preorder";
import { studentModuleStates } from "@/lib/module-access";

/** notopen: erken kayıt yapılmış, eğitim henüz açılmadı (opensAt = açılış tarihi) */
export type PlayerAccess = { ok: false; reason: "login" | "noaccess" } | { ok: false; reason: "notopen"; opensAt: string } | { ok: true; preview: boolean };

export async function playerAccess(user: SessionUser | null, courseId: number): Promise<PlayerAccess> {
  if (!user) return { ok: false, reason: "login" };
  const e = await getEnrollment(user.id, courseId);
  const staff = async () => user.role === "admin" || (user.role === "teacher" && (await ownsCourse(user, courseId)));
  if (e && e.status === "active") {
    if (!e.startedAt) {
      // Erken kayıt: açılış tarihine kadar içerik kapalı (yönetici/eğitmen önizleme olarak görür)
      const [c] = await db.select({ preorder: courses.preorder, opensAt: courses.opensAt }).from(courses).where(eq(courses.id, courseId)).limit(1);
      if (c && awaitsOpening(c, e)) return (await staff()) ? { ok: true, preview: true } : { ok: false, reason: "notopen", opensAt: c.opensAt! };
    }
    return { ok: true, preview: false };
  }
  if (await staff()) return { ok: true, preview: true };
  return { ok: false, reason: "noaccess" };
}

/** İlk açılışta started_at damgası (önizlemede değil) */
export async function stampStarted(userId: number, courseId: number) {
  await db
    .update(enrollments)
    .set({ startedAt: new Date() })
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)));
}

export async function playerState(userId: number, courseId: number, preview: boolean) {
  const course = await getCourseFull(courseId);
  if (!course) return null;
  const [sets, moduleStates] = preview
    ? [{ done: new Set<number>(), open: new Set<number>() }, null]
    : await Promise.all([lessonSets(userId, courseId, course.flatLessons), studentModuleStates(userId, courseId, course.modules)]);
  const done = sets.done;
  const prog = computeProgress(course.flatLessons, done);
  // Kilit "open" kümesine bakar: geçilemeyip hakkı biten sınav yolu kapatmaz ama tamamlanmış da sayılmaz
  let frontier = preview ? course.flatLessons.length : computeFrontier(course.flatLessons, sets.open);
  // Modül kilidi: kapalı modülün dersleri sıralı kilidin önüne geçer (ilk kapalı modülün ilk dersinden itibaren kilitli;
  // ilk modül kapalıysa frontier -1 → hiçbir ders açık değil)
  if (moduleStates) {
    const firstClosed = course.flatLessons.findIndex((l) => moduleStates.get(l.moduleId)?.open === false);
    if (firstClosed !== -1) frontier = Math.min(frontier, firstClosed - 1);
  }
  return { course, done, prog, frontier, moduleStates };
}

/**
 * Sıralı kilidin SUNUCU denetimi: ders öğrenciye açık mı? Oynatıcı sayfası kilidi ekranda uygular;
 * tamamlama/sınav/görev işlemleri de elle gönderilen isteklere karşı bunu çağırır.
 */
export async function lessonUnlocked(userId: number, courseId: number, lessonId: number) {
  const state = await playerState(userId, courseId, false);
  if (!state) return false;
  const idx = state.course.flatLessons.findIndex((l) => l.id === lessonId);
  return idx !== -1 && idx <= state.frontier;
}

/** Tek sorunun değerlendirmesi (test / doğru-yanlış). Doğru cevap yalnızca cevap kilitlendikten sonra istemciye gider. */
export function evaluateAnswer(x: Pick<QuizQuestion, "type" | "correct" | "explanation">, answer: number | string | undefined | null) {
  let correct = false;
  let correctAnswer: number | string | null = null;
  if (x.type === "multiple_choice") {
    const idx = typeof answer === "number" ? answer : parseInt(String(answer), 10);
    correct = Array.isArray(x.correct) && x.correct.includes(idx);
    correctAnswer = Array.isArray(x.correct) ? x.correct[0] ?? null : null;
  } else if (x.type === "true_false") {
    correct = String(answer) === String(x.correct);
    correctAnswer = String(x.correct);
  }
  return { correct, correctAnswer, explanation: x.explanation ?? "" };
}

export async function quizForLesson(lessonId: number) {
  const [q] = await db.select().from(quizzes).where(and(eq(quizzes.lessonId, lessonId), eq(quizzes.status, "active"))).limit(1);
  return q ?? null;
}

export async function assignmentForLesson(lessonId: number) {
  const [a] = await db.select().from(assignments).where(and(eq(assignments.lessonId, lessonId), eq(assignments.status, "active"))).limit(1);
  return a ?? null;
}

export async function quizPayload(quizId: number, userId: number) {
  const [q] = await db.select().from(quizzes).where(eq(quizzes.id, quizId)).limit(1);
  // Silinmiş sınav eski bağlantıdan açılamaz
  if (!q || q.status !== "active") return null;
  const qs = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quizId)).orderBy(quizQuestions.sortOrder, quizQuestions.id);
  const attempts = await db
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.userId, userId), eq(quizAttempts.voided, false)))
    .orderBy(quizAttempts.id);
  const finished = attempts.filter((a) => a.status !== "in_progress");
  const standing = quizStanding(q, attempts);
  const base = await studentTaskBase(userId, q.courseId);
  const due = q.extraDays && q.extraDays > 0 ? taskDue(base, q.extraDays) : deadlineOf(q.endDate);
  // Cevap listesi YALNIZCA sınav geçildiyse (geçen deneme) gider. Doğru cevaplar çözerken istemciye gitmez; geçemeyen
  // öğrenci yeniden çözebileceği için cevaplarını ve doğruları göremez (2026-10-10). Açıklama yönetici ayarına bağlı.
  const passedAttempt = standing.passed ? [...finished].reverse().find((a) => attemptPassed(a, q.passScore)) : undefined;
  const review = passedAttempt ? await buildQuizReview(q, qs, passedAttempt.answers) : [];
  return {
    quiz: q,
    // correct cevaplar çözerken istemciye gitmez (yalnız review'da, geçildikten sonra)
    questions: qs.map((x) => ({ id: x.id, text: x.text, type: x.type, options: x.options, image: x.image, points: x.points })),
    attempts: finished,
    // Geçildiyse ya da hak bittiyse tekrar çözülemez (kural: quizStanding)
    canAttempt: standing.canAttempt,
    passed: standing.passed,
    exhausted: standing.exhausted,
    left: standing.left,
    due,
    review,
  };
}

/**
 * Geçilen sınavın cevap listesi: öğrencinin cevabı + doğru/yanlış; doğru cevap sınavın "Sonuçta doğru cevapları göster"
 * kutusuna, açıklama yöneticinin "Sınav sonunda açıklamaları göster" ayarına (panel.quizExplanations) bağlı.
 * Kapalı olan alan istemciye hiç gönderilmez.
 */
export async function buildQuizReview(q: { showCorrectAnswers: boolean }, qs: QuizQuestion[], answers: Record<string, unknown>): Promise<QuizReviewItem[]> {
  const showExplanations = (await getSetting("panel")).quizExplanations;
  return qs.map((x) => {
    const a = answers[String(x.id)];
    const yourAnswer =
      a === undefined || a === null || a === ""
        ? null
        : x.type === "multiple_choice"
          ? (x.options[Number(a)] ?? String(a))
          : x.type === "true_false"
            ? (a === "true" ? "Doğru" : "Yanlış")
            : String(a);
    const correctAnswer = !q.showCorrectAnswers
      ? ""
      : x.type === "multiple_choice"
        ? (Array.isArray(x.correct) ? x.correct.map((i) => x.options[i]).filter(Boolean).join(", ") : "")
        : x.type === "true_false"
          ? (String(x.correct) === "true" ? "Doğru" : "Yanlış")
          : "";
    const isCorrect =
      x.type === "multiple_choice"
        ? (Array.isArray(x.correct) && x.correct.includes(Number(a)))
        : x.type === "true_false"
          ? String(a) === String(x.correct)
          : null; // açık uçlu: doğru/yanlış yok
    return { text: x.text, type: x.type, options: x.options, image: x.image, points: x.points, yourAnswer, correctAnswer, isCorrect, explanation: showExplanations ? (x.explanation ?? "") : "" };
  });
}

/**
 * Eğitim bitince gösterilen sınav özeti: öğrencinin en iyi puanı + katılımcıların (kişi başına en iyi puan) ortalaması.
 * Yalnızca puanlanan (test/D-Y sorusu olan) sınavlar; geçersiz sayılan denemeler hesaba girmez.
 */
export async function courseQuizStats(userId: number, courseId: number) {
  const rows = await db
    .select({ id: quizzes.id, title: quizzes.title, userId: quizAttempts.userId, score: quizAttempts.score })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
    .where(and(eq(quizzes.courseId, courseId), eq(quizzes.status, "active"), eq(quizAttempts.voided, false), eq(quizAttempts.status, "completed"), gt(quizAttempts.totalPoints, 0)))
    .orderBy(quizzes.id);
  const byQuiz = new Map<number, { title: string; best: Map<number, number> }>();
  for (const r of rows) {
    const g = byQuiz.get(r.id) ?? { title: r.title, best: new Map<number, number>() };
    const s = Number(r.score ?? 0);
    g.best.set(r.userId, Math.max(g.best.get(r.userId) ?? 0, s));
    byQuiz.set(r.id, g);
  }
  const out: { id: number; title: string; mine: number; average: number; participants: number }[] = [];
  for (const [id, g] of byQuiz) {
    const mine = g.best.get(userId);
    if (mine === undefined) continue;
    const all = [...g.best.values()];
    out.push({ id, title: g.title, mine: Math.round(mine), average: Math.round(all.reduce((a, b) => a + b, 0) / all.length), participants: all.length });
  }
  return out;
}

export async function assignmentPayload(assignmentId: number, userId: number) {
  const [a] = await db.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
  // Silinmiş görev eski bağlantıdan açılamaz
  if (!a || a.status !== "active") return null;
  const [sub] = await db
    .select()
    .from(assignmentSubmissions)
    .where(and(eq(assignmentSubmissions.assignmentId, a.id), eq(assignmentSubmissions.userId, userId)))
    .limit(1);
  const base = await studentTaskBase(userId, a.courseId);
  const due = a.extraDays > 0 ? taskDue(base, a.extraDays) : deadlineOf(a.dueDate);
  return { assignment: a, submission: sub ?? null, due };
}

export async function lessonQuestions(userId: number, courseId: number) {
  const qs = await db
    .select()
    .from(questions)
    .where(and(eq(questions.userId, userId), eq(questions.courseId, courseId)))
    .orderBy(questions.id);
  if (qs.length === 0) return [];
  const ans = await db
    .select({ a: questionAnswers, name: users.firstName, last: users.lastName })
    .from(questionAnswers)
    .innerJoin(users, eq(questionAnswers.userId, users.id))
    // Yalnızca bu öğrencinin sorularına verilen cevaplar (tablonun tümü çekilmez)
    .where(inArray(questionAnswers.questionId, qs.map((q) => q.id)))
    .orderBy(questionAnswers.id);
  return qs.map((q) => ({
    id: q.id,
    text: q.text,
    lessonTitle: q.lessonTitle,
    status: q.status,
    createdAt: q.createdAt.toISOString(),
    answers: ans
      .filter((x) => x.a.questionId === q.id)
      .map((x) => ({ id: x.a.id, text: x.a.text, isInstructor: x.a.isInstructor, name: `${x.name} ${x.last}`.trim(), createdAt: x.a.createdAt.toISOString() })),
  }));
}
