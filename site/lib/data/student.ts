import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  enrollments,
  progress,
  lessons,
  quizAttempts,
  quizzes,
  assignments,
  assignmentSubmissions,
  courses,
  periods,
  periodEnrollments,
  orders,
  issuedCertificates,
  certificateTemplates,
  type Lesson,
} from "@/db/schema";
import { computeProgress, taskBase, taskDue, deadlineOf, type TaskBase } from "@/lib/course-logic";

/** Öğrencinin erişebildiği kurs id'leri (aktif kayıt) */
export async function accessibleCourseIds(userId: number) {
  const rows = await db
    .select({ courseId: enrollments.courseId })
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.status, "active")));
  return rows.map((r) => r.courseId);
}

export async function getEnrollment(userId: number, courseId: number) {
  const rows = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function hasAccess(userId: number, courseId: number) {
  const e = await getEnrollment(userId, courseId);
  return !!e && e.status === "active";
}

/**
 * Tamamlanmış ders id'leri: video/file → progress; quiz → attempt var; assign → submission var.
 * Tek yerden hesaplanır ki panel/player/rapor aynı sonucu versin.
 */
export async function doneLessonIds(userId: number, courseId: number, courseLessons: Lesson[]) {
  const done = new Set<number>();
  const [prog, qAtt, aSub] = await Promise.all([
    db
      .select({ lessonId: progress.lessonId })
      .from(progress)
      .where(and(eq(progress.userId, userId), eq(progress.courseId, courseId))),
    db
      .select({ lessonId: quizzes.lessonId })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
      .where(
        and(
          eq(quizAttempts.userId, userId),
          eq(quizzes.courseId, courseId),
          inArray(quizAttempts.status, ["completed", "pending_review"])
        )
      ),
    db
      .select({ lessonId: assignments.lessonId })
      .from(assignmentSubmissions)
      .innerJoin(assignments, eq(assignmentSubmissions.assignmentId, assignments.id))
      .where(and(eq(assignmentSubmissions.userId, userId), eq(assignments.courseId, courseId))),
  ]);
  for (const p of prog) done.add(p.lessonId);
  for (const q of qAtt) if (q.lessonId) done.add(q.lessonId);
  for (const a of aSub) if (a.lessonId) done.add(a.lessonId);
  // Var olmayan derslere ait kayıtları at
  const valid = new Set(courseLessons.map((l) => l.id));
  for (const id of [...done]) if (!valid.has(id)) done.delete(id);
  return done;
}

export async function courseProgress(userId: number, courseId: number) {
  const ls = await db
    .select()
    .from(lessons)
    .where(eq(lessons.courseId, courseId))
    .orderBy(asc(lessons.sortOrder), asc(lessons.id));
  const done = await doneLessonIds(userId, courseId, ls);
  return { ...computeProgress(ls, done), lessons: ls, done };
}

/** Öğrencinin bir kurs için göreli son teslim tabanı */
export async function studentTaskBase(userId: number, courseId: number): Promise<TaskBase> {
  const [pe] = await db
    .select({ startDate: periods.startDate, startTime: periods.startTime })
    .from(periodEnrollments)
    .innerJoin(periods, eq(periodEnrollments.periodId, periods.id))
    .where(and(eq(periodEnrollments.userId, userId), eq(periods.courseId, courseId)))
    .orderBy(asc(periods.startDate))
    .limit(1);
  if (pe) return taskBase({ periodStartDate: pe.startDate, periodStartTime: pe.startTime });
  const e = await getEnrollment(userId, courseId);
  return taskBase({ startedAt: e?.startedAt ?? null });
}

export type StudentCourseSummary = {
  id: number;
  slug: string;
  title: string;
  imageUrl: string;
  group: string;
  total: number;
  completed: number;
  percent: number;
  enrolledAt: Date;
  startedAt: Date | null;
};

export async function studentCourses(userId: number): Promise<StudentCourseSummary[]> {
  const rows = await db
    .select({ c: courses, e: enrollments })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(and(eq(enrollments.userId, userId), eq(enrollments.status, "active")))
    .orderBy(desc(enrollments.enrolledAt));
  const out: StudentCourseSummary[] = [];
  for (const r of rows) {
    const p = await courseProgress(userId, r.c.id);
    out.push({
      id: r.c.id,
      slug: r.c.slug,
      title: r.c.title,
      imageUrl: r.c.imageUrl,
      group: r.c.group,
      total: p.total,
      completed: p.completed,
      percent: p.percent,
      enrolledAt: r.e.enrolledAt,
      startedAt: r.e.startedAt,
    });
  }
  return out;
}

export type ActionItem = {
  kind: "assignment" | "quiz";
  id: number;
  title: string;
  courseId: number;
  courseTitle: string;
  due: Date | null;
  done: boolean;
  status: string; // pending|submitted|graded|taken
  score: number | null;
  best: number | null;
  link: string;
};

export type CalendarItem = {
  type: "session" | "assignment" | "quiz";
  date: Date;
  title: string;
  courseTitle: string;
  link: string;
  done: boolean;
  external: boolean;
};

/** Panel: görevler + sınavlar + takvim */
export async function studentActions(userId: number) {
  const ids = await accessibleCourseIds(userId);
  const items: ActionItem[] = [];
  const calendar: CalendarItem[] = [];
  if (ids.length === 0) return { items, calendar };

  const cs = await db.select({ id: courses.id, title: courses.title }).from(courses).where(inArray(courses.id, ids));
  const titleOf = new Map(cs.map((c) => [c.id, c.title]));
  const bases = new Map<number, TaskBase>();
  for (const id of ids) bases.set(id, await studentTaskBase(userId, id));

  const [asg, subs, qz, atts] = await Promise.all([
    db.select().from(assignments).where(and(inArray(assignments.courseId, ids), eq(assignments.status, "active"))),
    db.select().from(assignmentSubmissions).where(eq(assignmentSubmissions.userId, userId)),
    db.select().from(quizzes).where(and(inArray(quizzes.courseId, ids), eq(quizzes.status, "active"))),
    db.select().from(quizAttempts).where(and(eq(quizAttempts.userId, userId), inArray(quizAttempts.status, ["completed", "pending_review"]))),
  ]);

  for (const a of asg) {
    const sub = subs.find((s) => s.assignmentId === a.id);
    const due = a.extraDays > 0 ? taskDue(bases.get(a.courseId) ?? null, a.extraDays) : deadlineOf(a.dueDate);
    const link = `/kurs-izle/${a.courseId}?gorev=${a.id}`;
    items.push({
      kind: "assignment",
      id: a.id,
      title: a.title,
      courseId: a.courseId,
      courseTitle: titleOf.get(a.courseId) ?? "",
      due,
      done: !!sub,
      status: sub ? (sub.status === "graded" ? "graded" : "submitted") : "pending",
      score: sub?.score ?? null,
      best: null,
      link,
    });
    if (due) calendar.push({ type: "assignment", date: due, title: a.title, courseTitle: titleOf.get(a.courseId) ?? "", link, done: !!sub, external: false });
  }
  for (const q of qz) {
    const mine = atts.filter((x) => x.quizId === q.id);
    const best = mine.length ? Math.max(...mine.map((x) => Number(x.score ?? 0))) : null;
    const due = q.extraDays && q.extraDays > 0 ? taskDue(bases.get(q.courseId) ?? null, q.extraDays) : deadlineOf(q.endDate);
    const link = `/kurs-izle/${q.courseId}?quiz=${q.id}`;
    items.push({
      kind: "quiz",
      id: q.id,
      title: q.title,
      courseId: q.courseId,
      courseTitle: titleOf.get(q.courseId) ?? "",
      due,
      done: mine.length > 0,
      status: mine.length ? "taken" : "pending",
      score: null,
      best,
      link,
    });
    if (due) calendar.push({ type: "quiz", date: due, title: q.title, courseTitle: titleOf.get(q.courseId) ?? "", link, done: mine.length > 0, external: false });
  }

  // Canlı oturumlar
  const pes = await db
    .select({ p: periods })
    .from(periodEnrollments)
    .innerJoin(periods, eq(periodEnrollments.periodId, periods.id))
    .where(eq(periodEnrollments.userId, userId));
  for (const { p } of pes) {
    for (const s of p.schedule ?? []) {
      if (!s.date) continue;
      const d = new Date(`${s.date}T${s.time || "00:00"}:00`);
      calendar.push({
        type: "session",
        date: d,
        title: s.title || "Canlı oturum",
        courseTitle: `${titleOf.get(p.courseId) ?? ""} · ${p.name}`,
        link: s.link || "/panel/takvim",
        done: d.getTime() < Date.now(),
        external: !!s.link,
      });
    }
  }

  items.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const ad = a.due?.getTime() ?? Infinity;
    const bd = b.due?.getTime() ?? Infinity;
    return ad - bd;
  });
  calendar.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { items, calendar };
}

export async function studentOrders(userId: number) {
  return db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt)).limit(30);
}

export async function studentCertificates(userId: number) {
  return db
    .select({ ic: issuedCertificates, tplTitle: certificateTemplates.title })
    .from(issuedCertificates)
    .innerJoin(certificateTemplates, eq(issuedCertificates.templateId, certificateTemplates.id))
    .where(eq(issuedCertificates.userId, userId))
    .orderBy(desc(issuedCertificates.issuedAt));
}

export const activeEnrollmentCount = (courseId: number) =>
  sql<number>`(select count(*) from ${enrollments} e where e.course_id = ${courseId} and e.status = 'active')`;
