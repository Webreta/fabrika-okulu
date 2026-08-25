import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { enrollments, quizzes, assignments, quizAttempts, assignmentSubmissions, quizQuestions, questions, questionAnswers, users } from "@/db/schema";
import { getCourseFull } from "@/lib/data/courses";
import { doneLessonIds, getEnrollment, studentTaskBase } from "@/lib/data/student";
import { computeProgress, computeFrontier, taskDue, deadlineOf } from "@/lib/course-logic";
import type { SessionUser } from "@/lib/auth/session";
import { ownsCourse } from "@/lib/data/teacher";

export type PlayerAccess = { ok: false; reason: "login" | "noaccess" } | { ok: true; preview: boolean };

export async function playerAccess(user: SessionUser | null, courseId: number): Promise<PlayerAccess> {
  if (!user) return { ok: false, reason: "login" };
  const e = await getEnrollment(user.id, courseId);
  if (e && e.status === "active") return { ok: true, preview: false };
  if (user.role === "admin" || (user.role === "teacher" && (await ownsCourse(user, courseId)))) return { ok: true, preview: true };
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
  const done = preview ? new Set<number>() : await doneLessonIds(userId, courseId, course.flatLessons);
  const prog = computeProgress(course.flatLessons, done);
  const frontier = preview ? course.flatLessons.length : computeFrontier(course.flatLessons, done);
  return { course, done, prog, frontier };
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
  if (!q) return null;
  const qs = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quizId)).orderBy(quizQuestions.sortOrder, quizQuestions.id);
  const attempts = await db
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.userId, userId)))
    .orderBy(quizAttempts.id);
  const finished = attempts.filter((a) => a.status !== "in_progress");
  const base = await studentTaskBase(userId, q.courseId);
  const due = q.extraDays && q.extraDays > 0 ? taskDue(base, q.extraDays) : deadlineOf(q.endDate);
  return {
    quiz: q,
    // correct cevaplar istemciye gitmez
    questions: qs.map((x) => ({ id: x.id, text: x.text, type: x.type, options: x.options, image: x.image, points: x.points })),
    attempts: finished,
    canAttempt: q.maxAttempts === 0 || finished.length < q.maxAttempts,
    due,
  };
}

export async function assignmentPayload(assignmentId: number, userId: number) {
  const [a] = await db.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
  if (!a) return null;
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
