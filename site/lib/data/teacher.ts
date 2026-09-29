import "server-only";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  courses, instructors, enrollments, lessons, assignmentSubmissions, assignments, quizAttempts, quizzes, questions, questionAnswers, users, periods, issuedCertificates, certificateTemplates,
} from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { doneLessonIds } from "@/lib/data/student";
import { computeProgress } from "@/lib/course-logic";

/** Eğitmenin sahip olduğu kurs id'leri: authorId = kullanıcı VEYA instructorId = kullanıcının eğitmen profili. Admin → hepsi */
export async function teacherCourseIds(user: SessionUser): Promise<number[]> {
  if (user.role === "admin") {
    return (await db.select({ id: courses.id }).from(courses)).map((r) => r.id);
  }
  const [prof] = await db.select({ id: instructors.id }).from(instructors).where(eq(instructors.userId, user.id)).limit(1);
  const rows = await db
    .select({ id: courses.id })
    .from(courses)
    .where(prof ? sql`${courses.authorId} = ${user.id} or ${courses.instructorId} = ${prof.id}` : eq(courses.authorId, user.id));
  return rows.map((r) => r.id);
}

export async function ownsCourse(user: SessionUser, courseId: number) {
  if (user.role === "admin") return true;
  const ids = await teacherCourseIds(user);
  return ids.includes(courseId);
}

export async function ensureInstructorProfile(user: SessionUser) {
  const [prof] = await db.select().from(instructors).where(eq(instructors.userId, user.id)).limit(1);
  if (prof) return prof;
  const [created] = await db.insert(instructors).values({ userId: user.id, name: user.name, email: user.email }).returning();
  return created;
}

export async function teacherOverview(user: SessionUser) {
  const ids = await teacherCourseIds(user);
  if (ids.length === 0) return { ids, courses: [], studentCount: 0, submissionCount: 0, pendingQuestions: 0 };
  const cs = await db
    .select({
      c: courses,
      // Alt sorguda tablo adı açıkça yazılır: ${courses.id} öneksiz "id" üretir ve alt sorgunun kendi tablosuna bağlanır
      students: sql<number>`(select count(*) from ${enrollments} e where e.course_id = "courses"."id" and e.status='active')`.mapWith(Number),
      lessonCount: sql<number>`(select count(*) from ${lessons} l where l.course_id = "courses"."id" and l.type <> 'file')`.mapWith(Number),
      periodCount: sql<number>`(select count(*) from ${periods} p where p.course_id = "courses"."id")`.mapWith(Number),
    })
    .from(courses)
    .where(inArray(courses.id, ids))
    .orderBy(desc(courses.createdAt));
  const [sc] = await db.select({ n: sql<number>`count(distinct ${enrollments.userId})`.mapWith(Number) }).from(enrollments).where(and(inArray(enrollments.courseId, ids), eq(enrollments.status, "active")));
  // Görev/sınav değerlendirmesi yoktur; "bekleyen" sayaç yalnızca cevaplanmamış sorular içindir. Görevlerde toplam teslim sayılır.
  const [subc] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(assignmentSubmissions)
    .innerJoin(assignments, eq(assignmentSubmissions.assignmentId, assignments.id))
    .where(inArray(assignments.courseId, ids));
  const [pqs] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(questions).where(and(inArray(questions.courseId, ids), eq(questions.status, "pending")));
  return {
    ids,
    courses: cs.map((r) => ({ ...r.c, students: r.students, lessonCount: r.lessonCount, hasPeriods: r.periodCount > 0 })),
    studentCount: sc.n,
    submissionCount: subc.n,
    pendingQuestions: pqs.n,
  };
}

export type StudentRow = {
  userId: number; name: string; email: string; courseId: number; courseTitle: string;
  enrolledAt: Date; startedAt: Date | null; completed: number; total: number; percent: number;
};

export async function teacherStudents(user: SessionUser, courseId?: number): Promise<StudentRow[]> {
  const ids = await teacherCourseIds(user);
  const scope = courseId && ids.includes(courseId) ? [courseId] : ids;
  if (scope.length === 0) return [];
  const rows = await db
    .select({ e: enrollments, u: users, c: courses })
    .from(enrollments)
    .innerJoin(users, eq(enrollments.userId, users.id))
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(and(inArray(enrollments.courseId, scope), eq(enrollments.status, "active")))
    .orderBy(desc(enrollments.enrolledAt));
  const lessonCache = new Map<number, (typeof lessons.$inferSelect)[]>();
  const out: StudentRow[] = [];
  for (const r of rows) {
    let ls = lessonCache.get(r.c.id);
    if (!ls) {
      ls = await db.select().from(lessons).where(eq(lessons.courseId, r.c.id)).orderBy(asc(lessons.sortOrder));
      lessonCache.set(r.c.id, ls);
    }
    const done = await doneLessonIds(r.u.id, r.c.id, ls);
    const p = computeProgress(ls, done);
    out.push({
      userId: r.u.id, name: `${r.u.firstName} ${r.u.lastName}`.trim() || r.u.email, email: r.u.email,
      courseId: r.c.id, courseTitle: r.c.title, enrolledAt: r.e.enrolledAt, startedAt: r.e.startedAt,
      completed: p.completed, total: p.total, percent: p.percent,
    });
  }
  return out;
}

/** Görev/sınav listeleri için serbest arama ve durum filtresi */
export type SubmissionFilter = { q?: string; status?: string };

/** Öğrenci adı-soyadı, e-posta ya da başlıkta geçen metin (ILIKE) */
function searchCond(q: string | undefined, title: typeof assignments.title | typeof quizzes.title) {
  const t = q?.trim();
  if (!t) return undefined;
  const like = `%${t}%`;
  return or(ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, like), ilike(users.email, like), ilike(title, like));
}

export async function teacherSubmissions(user: SessionUser, courseId?: number, limit = 60, filter: SubmissionFilter = {}) {
  const ids = await teacherCourseIds(user);
  const scope = courseId && ids.includes(courseId) ? [courseId] : ids;
  if (scope.length === 0) return [];
  return db
    .select({ s: assignmentSubmissions, a: assignments, u: users, courseTitle: courses.title })
    .from(assignmentSubmissions)
    .innerJoin(assignments, eq(assignmentSubmissions.assignmentId, assignments.id))
    .innerJoin(users, eq(assignmentSubmissions.userId, users.id))
    .innerJoin(courses, eq(assignments.courseId, courses.id))
    // Görev teslimlerinde durum süzgeci yoktur (puanlama yapılmaz); filter.status yalnızca sınav sonuçlarını süzer
    .where(and(inArray(assignments.courseId, scope), searchCond(filter.q, assignments.title)))
    .orderBy(desc(assignmentSubmissions.submittedAt))
    .limit(limit);
}

export async function teacherQuizAttempts(user: SessionUser, courseId?: number, limit = 40, filter: SubmissionFilter = {}) {
  const ids = await teacherCourseIds(user);
  const scope = courseId && ids.includes(courseId) ? [courseId] : ids;
  if (scope.length === 0) return [];
  // Durum: pending_review (değerlendirme bekliyor) · completed · passed / failed (tamamlananlar içinde geçti/kaldı)
  const st = filter.status;
  const statusCond =
    st === "pending_review" || st === "completed" ? eq(quizAttempts.status, st)
    : st === "passed" ? and(eq(quizAttempts.status, "completed"), eq(quizAttempts.passed, true))
    : st === "failed" ? and(eq(quizAttempts.status, "completed"), eq(quizAttempts.passed, false))
    : undefined;
  return db
    .select({ at: quizAttempts, q: quizzes, u: users, courseTitle: courses.title })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
    .innerJoin(users, eq(quizAttempts.userId, users.id))
    .innerJoin(courses, eq(quizzes.courseId, courses.id))
    .where(and(inArray(quizzes.courseId, scope), inArray(quizAttempts.status, ["completed", "pending_review"]), statusCond, searchCond(filter.q, quizzes.title)))
    .orderBy(desc(quizAttempts.id))
    .limit(limit);
}

export type ChatThread = {
  key: string; userId: number; courseId: number; name: string; email: string; courseTitle: string;
  pending: number; lastAt: Date;
  messages: { who: "student" | "teacher"; text: string; at: Date; lesson: string }[];
};

export async function teacherThreads(user: SessionUser): Promise<ChatThread[]> {
  const ids = await teacherCourseIds(user);
  if (ids.length === 0) return [];
  const qs = await db
    .select({ q: questions, u: users, courseTitle: courses.title })
    .from(questions)
    .innerJoin(users, eq(questions.userId, users.id))
    .innerJoin(courses, eq(questions.courseId, courses.id))
    .where(inArray(questions.courseId, ids))
    .orderBy(asc(questions.id));
  if (qs.length === 0) return [];
  const ans = await db.select().from(questionAnswers).where(inArray(questionAnswers.questionId, qs.map((x) => x.q.id))).orderBy(asc(questionAnswers.id));
  const map = new Map<string, ChatThread>();
  for (const { q, u, courseTitle } of qs) {
    const key = `${q.userId}_${q.courseId}`;
    const t = map.get(key) ?? {
      key, userId: q.userId, courseId: q.courseId, name: `${u.firstName} ${u.lastName}`.trim() || u.email, email: u.email, courseTitle,
      pending: 0, lastAt: q.createdAt, messages: [],
    };
    t.messages.push({ who: "student", text: q.text, at: q.createdAt, lesson: q.lessonTitle });
    if (q.status === "pending") t.pending++;
    if (q.createdAt > t.lastAt) t.lastAt = q.createdAt;
    for (const a of ans.filter((x) => x.questionId === q.id)) {
      t.messages.push({ who: a.isInstructor ? "teacher" : "student", text: a.text, at: a.createdAt, lesson: "" });
      if (a.createdAt > t.lastAt) t.lastAt = a.createdAt;
    }
    map.set(key, t);
  }
  const list = [...map.values()];
  for (const t of list) t.messages.sort((a, b) => a.at.getTime() - b.at.getTime());
  list.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
  return list;
}

/** Sertifika akışı: son 60 kayıt + uygun/verilmiş sertifikalar */
export async function certificateFeed(user: SessionUser, courseId?: number) {
  const ids = await teacherCourseIds(user);
  const scope = courseId && ids.includes(courseId) ? [courseId] : ids;
  const templates = await db.select().from(certificateTemplates);
  if (scope.length === 0 || templates.length === 0) return { rows: [], templates };
  const students = await teacherStudents(user, courseId);
  const issued = await db.select().from(issuedCertificates).where(inArray(issuedCertificates.courseId, scope));
  const rows = students.slice(0, 80).map((s) => {
    const level = s.total > 0 && s.completed >= s.total ? 3 : s.startedAt ? 2 : 1;
    // Elle verme her zaman mümkündür; koşulu henüz sağlanmayan tasarım "met: false" ile işaretlenir (ekranda uyarı çıkar)
    const eligible = templates
      .filter((t) => !(t.rule.scope === "course" && t.rule.courseId !== s.courseId))
      .map((t) => {
        const need = t.rule.condition === "enrolled" ? 1 : t.rule.condition === "started" ? 2 : 3;
        return { ...t, met: level >= need };
      });
    const mine = issued.filter((i) => i.userId === s.userId && i.courseId === s.courseId);
    return { ...s, level, eligible: eligible.filter((t) => !mine.some((i) => i.templateId === t.id)), issued: mine.map((i) => ({ ...i, title: templates.find((t) => t.id === i.templateId)?.title ?? "" })) };
  }).filter((r) => r.eligible.length > 0 || r.issued.length > 0);
  return { rows, templates };
}
