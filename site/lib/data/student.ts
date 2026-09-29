import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { meetingSessions, nextSession, type MeetingSession } from "@/lib/meeting";
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
  meetingAttendance,
} from "@/db/schema";
import { computeProgress, taskBase, taskDue, deadlineOf, isPreorder, opensAtDate, quizStanding, type TaskBase, type AttemptLite } from "@/lib/course-logic";

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
 * Ders durumları; tek yerden hesaplanır ki panel/player/rapor aynı sonucu versin.
 *  - done: tamamlanmış dersler (ilerleme ve sertifika bunu kullanır): video/file → progress; assign → gönderim var;
 *    quiz → sınav GEÇİLDİ (geçme notu 0 ise tamamlanması yeter).
 *  - open: sıralı kilidi açan dersler = done + geçilemeyip deneme hakkı biten sınavlar (öğrenci takılıp kalmaz,
 *    ama kursu %100 yapamaz).
 */
export async function lessonSets(userId: number, courseId: number, courseLessons: Pick<Lesson, "id">[]) {
  const done = new Set<number>();
  const open = new Set<number>();
  const [prog, qAtt, aSub] = await Promise.all([
    db
      .select({ lessonId: progress.lessonId })
      .from(progress)
      .where(and(eq(progress.userId, userId), eq(progress.courseId, courseId))),
    db
      .select({
        lessonId: quizzes.lessonId, quizId: quizzes.id, passScore: quizzes.passScore, maxAttempts: quizzes.maxAttempts,
        status: quizAttempts.status, passed: quizAttempts.passed, score: quizAttempts.score,
      })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
      .where(
        and(
          eq(quizAttempts.userId, userId),
          eq(quizzes.courseId, courseId),
          eq(quizAttempts.voided, false),
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
  const byQuiz = new Map<number, { lessonId: number | null; passScore: number; maxAttempts: number; attempts: AttemptLite[] }>();
  for (const q of qAtt) {
    const g = byQuiz.get(q.quizId) ?? { lessonId: q.lessonId, passScore: q.passScore, maxAttempts: q.maxAttempts, attempts: [] };
    g.attempts.push({ status: q.status, passed: q.passed, score: q.score });
    byQuiz.set(q.quizId, g);
  }
  for (const g of byQuiz.values()) {
    if (!g.lessonId) continue;
    const st = quizStanding(g, g.attempts);
    if (st.passed) done.add(g.lessonId);
    else if (st.exhausted) open.add(g.lessonId);
  }
  for (const a of aSub) if (a.lessonId) done.add(a.lessonId);
  // Var olmayan derslere ait kayıtları at
  const valid = new Set(courseLessons.map((l) => l.id));
  for (const id of [...done]) if (!valid.has(id)) done.delete(id);
  for (const id of done) open.add(id);
  for (const id of [...open]) if (!valid.has(id)) open.delete(id);
  return { done, open };
}

/** Tamamlanmış ders id'leri (ilerleme/sertifika). Sınav dersi yalnızca geçildiyse tamamlanmış sayılır. */
export async function doneLessonIds(userId: number, courseId: number, courseLessons: Pick<Lesson, "id">[]) {
  return (await lessonSets(userId, courseId, courseLessons)).done;
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

export type StudentMeeting = {
  periodId: number;
  periodName: string;
  minutes: number;
  sessions: MeetingSession[];
  next: MeetingSession | null;
  allDone: boolean;
};

export type StudentCourseSummary = {
  id: number;
  slug: string;
  title: string;
  imageUrl: string;
  group: string;
  type: "course" | "meeting";
  /** Online görüşme ürününde koltuk ve oturum bilgisi */
  meeting: StudentMeeting | null;
  total: number;
  completed: number;
  percent: number;
  enrolledAt: Date;
  startedAt: Date | null;
  /** Erken kayıt: eğitim henüz açılmadıysa açılış tarihi (YYYY-MM-DD); açıksa null */
  opensAt: string | null;
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
    if (r.c.type === "meeting") {
      // Görüşme: ilerleme = katılınan oturum / toplam oturum
      const m = await studentMeeting(userId, r.c.id, r.c.meetingMinutes, r.c.meetingLink);
      const total = m?.sessions.length ?? 0;
      const completed = m?.sessions.filter((s) => s.attended).length ?? 0;
      out.push({
        id: r.c.id, slug: r.c.slug, title: r.c.title, imageUrl: r.c.imageUrl, group: r.c.group, type: "meeting", meeting: m,
        total, completed, percent: total ? Math.round((completed / total) * 100) : 0, enrolledAt: r.e.enrolledAt, startedAt: r.e.startedAt, opensAt: null,
      });
      continue;
    }
    const p = await courseProgress(userId, r.c.id);
    out.push({
      id: r.c.id,
      slug: r.c.slug,
      title: r.c.title,
      imageUrl: r.c.imageUrl,
      group: r.c.group,
      type: "course",
      meeting: null,
      total: p.total,
      completed: p.completed,
      percent: p.percent,
      enrolledAt: r.e.enrolledAt,
      startedAt: r.e.startedAt,
      opensAt: isPreorder(r.c) && !r.e.startedAt ? r.c.opensAt : null,
    });
  }
  return out;
}

/** Öğrencinin bu görüşme ürünündeki koltuğu ve oturumları (kayıtlı değilse null) */
export async function studentMeeting(userId: number, courseId: number, minutes: number, fallbackLink: string): Promise<StudentMeeting | null> {
  const [pe] = await db
    .select({ p: periods })
    .from(periodEnrollments)
    .innerJoin(periods, eq(periodEnrollments.periodId, periods.id))
    .where(and(eq(periodEnrollments.userId, userId), eq(periods.courseId, courseId)))
    .limit(1);
  if (!pe) return null;
  const att = await db.select({ i: meetingAttendance.sessionIndex }).from(meetingAttendance).where(and(eq(meetingAttendance.userId, userId), eq(meetingAttendance.periodId, pe.p.id)));
  const sessions = meetingSessions(pe.p.schedule ?? [], minutes, att.map((a) => a.i), fallbackLink);
  return { periodId: pe.p.id, periodName: pe.p.name, minutes, sessions, next: nextSession(sessions), allDone: sessions.length > 0 && sessions.every((s) => s.attended) };
}

export type ActionItem = {
  kind: "assignment" | "quiz" | "meeting";
  id: number;
  title: string;
  courseId: number;
  courseTitle: string;
  due: Date | null;
  done: boolean;
  status: string; // pending|submitted|taken|attended
  /** Sınavda en iyi puan (%). Görevlerde puanlama yoktur. */
  best: number | null;
  link: string;
};

export type CalendarItem = {
  /** opening: erken kayıt yapılan eğitimin açılış günü */
  type: "session" | "assignment" | "quiz" | "meeting" | "opening";
  date: Date;
  /** Kaydın "yaklaşan" sayıldığı son an: görev/sınavda son tarih, görüşmede bitiş saati, canlı derste başlangıç + LIVE_SESSION_MINUTES */
  end: Date;
  title: string;
  courseTitle: string;
  link: string;
  done: boolean;
  /** Bağlantı dış adrestir (canlı derste: katılım bağlantısı girilmiş demektir) */
  external: boolean;
};

/** Canlı derslerin süresi kayıtlı değildir; ders, başlangıcından bu kadar dakika sonra "geçmiş" sayılır */
export const LIVE_SESSION_MINUTES = 120;

/**
 * Panel: görevler + sınavlar + takvim.
 * İstek başına bir kez hesaplanır (panel layout'u ve sayfa aynı sonucu paylaşır).
 */
export const studentActions = cache(async function studentActions(userId: number) {
  const allIds = await accessibleCourseIds(userId);
  const items: ActionItem[] = [];
  const calendar: CalendarItem[] = [];
  if (allIds.length === 0) return { items, calendar };

  const cs = await db.select({ id: courses.id, title: courses.title, type: courses.type, meetingMinutes: courses.meetingMinutes, meetingLink: courses.meetingLink, preorder: courses.preorder, opensAt: courses.opensAt }).from(courses).where(inArray(courses.id, allIds));
  // Erken kayıt: açılışı bekleyen eğitimin görev/sınav/oturumları listelenmez; yalnızca açılış günü gündeme düşer
  const started = new Set((await db.select({ courseId: enrollments.courseId, startedAt: enrollments.startedAt }).from(enrollments).where(and(eq(enrollments.userId, userId), eq(enrollments.status, "active")))).filter((e) => e.startedAt).map((e) => e.courseId));
  const waiting = new Set(cs.filter((c) => isPreorder(c) && !started.has(c.id)).map((c) => c.id));
  for (const c of cs) {
    const d = waiting.has(c.id) ? opensAtDate(c) : null;
    if (d) calendar.push({ type: "opening", date: d, end: d, title: "Eğitim aktifleşiyor", courseTitle: c.title, link: "/panel/egitim", done: false, external: false });
  }
  const ids = allIds.filter((id) => !waiting.has(id));
  if (ids.length === 0) return { items, calendar };
  const titleOf = new Map(cs.map((c) => [c.id, c.title]));
  const meetingOf = new Map(cs.filter((c) => c.type === "meeting").map((c) => [c.id, c]));
  const bases = new Map<number, TaskBase>();
  for (const id of ids) bases.set(id, await studentTaskBase(userId, id));

  const [asg, subs, qz, atts] = await Promise.all([
    db.select().from(assignments).where(and(inArray(assignments.courseId, ids), eq(assignments.status, "active"))),
    db.select().from(assignmentSubmissions).where(eq(assignmentSubmissions.userId, userId)),
    db.select().from(quizzes).where(and(inArray(quizzes.courseId, ids), eq(quizzes.status, "active"))),
    db.select().from(quizAttempts).where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.voided, false), inArray(quizAttempts.status, ["completed", "pending_review"]))),
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
      status: sub ? "submitted" : "pending",
      best: null,
      link,
    });
    if (due) calendar.push({ type: "assignment", date: due, end: due, title: a.title, courseTitle: titleOf.get(a.courseId) ?? "", link, done: !!sub, external: false });
  }
  for (const q of qz) {
    const mine = atts.filter((x) => x.quizId === q.id);
    const best = mine.length ? Math.max(...mine.map((x) => Number(x.score ?? 0))) : null;
    // Geçilemeyen ve hakkı duran sınav yapılacaklar arasında kalır
    const st = quizStanding(q, mine);
    const qDone = st.passed || st.exhausted;
    const due = q.extraDays && q.extraDays > 0 ? taskDue(bases.get(q.courseId) ?? null, q.extraDays) : deadlineOf(q.endDate);
    const link = `/kurs-izle/${q.courseId}?quiz=${q.id}`;
    items.push({
      kind: "quiz",
      id: q.id,
      title: q.title,
      courseId: q.courseId,
      courseTitle: titleOf.get(q.courseId) ?? "",
      due,
      done: qDone,
      status: qDone ? "taken" : "pending",
      best,
      link,
    });
    if (due) calendar.push({ type: "quiz", date: due, end: due, title: q.title, courseTitle: titleOf.get(q.courseId) ?? "", link, done: qDone, external: false });
  }

  // Canlı oturumlar
  const pes = await db
    .select({ p: periods })
    .from(periodEnrollments)
    .innerJoin(periods, eq(periodEnrollments.periodId, periods.id))
    .where(eq(periodEnrollments.userId, userId));
  const att = meetingOf.size ? await db.select().from(meetingAttendance).where(eq(meetingAttendance.userId, userId)) : [];
  for (const { p } of pes) {
    if (waiting.has(p.courseId)) continue;
    const mc = meetingOf.get(p.courseId);
    if (mc) {
      // Online görüşme: her oturum bir aksiyon + gündem kaydı; katılım işaretlenince tamamlanır
      const sessions = meetingSessions(p.schedule ?? [], mc.meetingMinutes, att.filter((a) => a.periodId === p.id).map((a) => a.sessionIndex), mc.meetingLink);
      for (const s of sessions) {
        const link = `/kurs-izle/${p.courseId}`;
        items.push({ kind: "meeting", id: p.id * 100 + s.index, title: sessions.length > 1 ? `${s.title} · ${mc.title}` : mc.title, courseId: p.courseId, courseTitle: mc.title, due: s.start, done: s.attended, status: s.attended ? "attended" : "pending", best: null, link });
        calendar.push({ type: "meeting", date: s.start, end: s.end, title: sessions.length > 1 ? s.title : "Birebir görüşme", courseTitle: mc.title, link, done: s.attended, external: false });
      }
      continue;
    }
    for (const s of p.schedule ?? []) {
      if (!s.date) continue;
      const d = new Date(`${s.date}T${s.time || "00:00"}:00`);
      if (isNaN(d.getTime())) continue;
      const end = new Date(d.getTime() + LIVE_SESSION_MINUTES * 60000);
      calendar.push({
        type: "session",
        date: d,
        end,
        title: s.title || "Canlı oturum",
        courseTitle: `${titleOf.get(p.courseId) ?? ""} · ${p.name}`,
        // Bağlantı girilmediyse external=false: sayfalar "Katıl" yerine "Bağlantı henüz eklenmedi" gösterir
        link: s.link || "/panel/takvim",
        done: end.getTime() < Date.now(),
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
});

export async function studentOrders(userId: number) {
  return db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt)).limit(30);
}

export async function studentCertificates(userId: number) {
  return db
    .select({ ic: issuedCertificates, tplTitle: certificateTemplates.title, tpl: certificateTemplates })
    .from(issuedCertificates)
    .innerJoin(certificateTemplates, eq(issuedCertificates.templateId, certificateTemplates.id))
    .where(eq(issuedCertificates.userId, userId))
    .orderBy(desc(issuedCertificates.issuedAt));
}

export const activeEnrollmentCount = (courseId: number) =>
  sql<number>`(select count(*) from ${enrollments} e where e.course_id = ${courseId} and e.status = 'active')`;
