import "server-only";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  assignments, assignmentSubmissions, enrollments, periodEnrollments, periods, courses, users, sentKeys, questions, quizAttempts,
} from "@/db/schema";
import { taskDue } from "@/lib/course-logic";
import { studentTaskBase } from "@/lib/data/student";
import { notifyUser, logNotification } from "@/lib/notify";
import { sendMail, emailTemplate, siteUrl, adminEmails } from "@/lib/mailer";
import { fmtDateTime, fmtDate, todayISO } from "@/lib/format";
import { getSetting } from "@/lib/settings";
import { instructors } from "@/db/schema";

/** Aynı hatırlatmayı tekrar göndermemek için */
async function once(key: string): Promise<boolean> {
  const r = await db.insert(sentKeys).values({ key }).onConflictDoNothing().returning({ key: sentKeys.key });
  return r.length > 0;
}

async function pruneKeys() {
  await db.delete(sentKeys).where(sql`${sentKeys.createdAt} < now() - interval '7 days'`);
}

/** Her 15 dk: canlı oturum 45-90 dk kala + görev son 1 saat */
export async function runFrequent() {
  let sent = 0;
  const now = Date.now();
  const today = todayISO();
  // Canlı oturum
  const pes = await db
    .select({ userId: periodEnrollments.userId, p: periods, courseTitle: courses.title })
    .from(periodEnrollments)
    .innerJoin(periods, eq(periodEnrollments.periodId, periods.id))
    .innerJoin(courses, eq(periods.courseId, courses.id));
  for (const { userId, p, courseTitle } of pes) {
    for (const [i, s] of (p.schedule ?? []).entries()) {
      if (s.date !== today || !s.time) continue;
      const start = new Date(`${s.date}T${s.time}:00`).getTime();
      const diff = (start - now) / 60000;
      if (diff < 45 || diff > 90) continue;
      if (!(await once(`sess:${p.id}:${i}:${s.date}:${userId}`))) continue;
      await notifyUser(userId, { title: "⏰ Birazdan canlı oturumun var", body: `${s.title || "Canlı oturum"} · ${s.time} · ${courseTitle}`, url: s.link || "/panel/takvim", tag: `sess-${p.id}-${i}` });
      sent++;
    }
  }
  // Görev son 1 saat
  const asg = await db.select().from(assignments).where(and(eq(assignments.status, "active"), gt(assignments.extraDays, 0)));
  for (const a of asg) {
    const students = await db
      .select({ userId: enrollments.userId })
      .from(enrollments)
      .where(and(eq(enrollments.courseId, a.courseId), eq(enrollments.status, "active")));
    const subs = await db.select({ userId: assignmentSubmissions.userId }).from(assignmentSubmissions).where(eq(assignmentSubmissions.assignmentId, a.id));
    const submitted = new Set(subs.map((s) => s.userId));
    for (const { userId } of students) {
      if (submitted.has(userId)) continue;
      const due = taskDue(await studentTaskBase(userId, a.courseId), a.extraDays);
      if (!due) continue;
      const diff = (due.getTime() - now) / 60000;
      if (diff < -15 || diff > 60) continue;
      if (!(await once(`due1h:${a.id}:${userId}:${today}`))) continue;
      await notifyUser(userId, { title: "⏰ Görevde son 1 saat", body: `${a.title} · ${fmtDateTime(due)}`, url: `/kurs-izle/${a.courseId}?gorev=${a.id}`, tag: `due-${a.id}` });
      sent++;
    }
  }
  return sent;
}

/** Günlük 07:00: yarınki görev/oturum hatırlatmaları + günlük rapor */
export async function runDaily() {
  const today = todayISO();
  if (!(await once(`daily:${today}`))) return { skipped: true };
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tISO = tomorrow.toISOString().slice(0, 10);
  let dueSent = 0, eventSent = 0;

  // Yarın biten görevler
  const asg = await db.select().from(assignments).where(and(eq(assignments.status, "active"), gt(assignments.extraDays, 0)));
  for (const a of asg) {
    const students = await db
      .select({ userId: enrollments.userId, email: users.email, name: users.firstName })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.userId, users.id))
      .where(and(eq(enrollments.courseId, a.courseId), eq(enrollments.status, "active")));
    const subs = new Set((await db.select({ userId: assignmentSubmissions.userId }).from(assignmentSubmissions).where(eq(assignmentSubmissions.assignmentId, a.id))).map((s) => s.userId));
    for (const s of students) {
      if (subs.has(s.userId)) continue;
      const due = taskDue(await studentTaskBase(s.userId, a.courseId), a.extraDays);
      if (!due || due.toISOString().slice(0, 10) !== tISO) continue;
      const url = `/kurs-izle/${a.courseId}?gorev=${a.id}`;
      await notifyUser(s.userId, { title: "⏰ Teslim yaklaşıyor", body: `${a.title} · yarın ${fmtDateTime(due)}`, url, tag: `due-${a.id}` });
      await sendMail({ type: "due_reminder", to: s.email, subject: `Görev son teslim yarın: ${a.title}`, html: emailTemplate({ title: "Teslim yaklaşıyor", html: `<p>Merhaba ${s.name},</p><p><b>${a.title}</b> görevinin son teslimi <b>${fmtDateTime(due)}</b>.</p>`, buttonText: "Göreve git", buttonUrl: siteUrl(url) }) });
      dueSent++;
    }
  }
  // Yarınki oturumlar
  const pes = await db
    .select({ userId: periodEnrollments.userId, email: users.email, name: users.firstName, p: periods, courseTitle: courses.title })
    .from(periodEnrollments)
    .innerJoin(periods, eq(periodEnrollments.periodId, periods.id))
    .innerJoin(courses, eq(periods.courseId, courses.id))
    .innerJoin(users, eq(periodEnrollments.userId, users.id));
  const byUser = new Map<number, { email: string; name: string; items: string[] }>();
  for (const r of pes) {
    const items = (r.p.schedule ?? []).filter((s) => s.date === tISO);
    if (!items.length) continue;
    const u = byUser.get(r.userId) ?? { email: r.email, name: r.name, items: [] };
    for (const s of items) u.items.push(`<li><b>${s.time || ""}</b> ${s.title || "Canlı oturum"} — ${r.courseTitle}${s.link ? ` · <a href="${s.link}">Katıl</a>` : ""}</li>`);
    byUser.set(r.userId, u);
  }
  for (const [userId, u] of byUser) {
    await sendMail({ type: "event_reminder", to: u.email, subject: `Yarınki etkinliklerin (${u.items.length})`, html: emailTemplate({ title: `Yarın ${u.items.length} etkinliğin var`, html: `<p>Merhaba ${u.name},</p><ul>${u.items.join("")}</ul>`, buttonText: "Takvimim", buttonUrl: siteUrl("/panel/takvim") }) });
    await notifyUser(userId, { title: "📅 Yarın canlı oturumun var", body: `${u.items.length} etkinlik`, url: "/panel/takvim", tag: `ev-${tISO}` });
    eventSent++;
  }
  await logNotification({ channel: "reminder", title: "Günlük hatırlatmalar", target: "öğrenciler", sentCount: dueSent + eventSent });

  // Günlük rapor (dün)
  const smtp = await getSetting("smtp");
  if (smtp.dailyReportEnabled) {
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yISO = y.toISOString().slice(0, 10);
    const [nq] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(questions).where(sql`${questions.createdAt}::date = ${yISO}`);
    const [ns] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(assignmentSubmissions).where(sql`${assignmentSubmissions.submittedAt}::date = ${yISO}`);
    const [nqa] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(quizAttempts).where(sql`${quizAttempts.completedAt}::date = ${yISO}`);
    const [ne] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(enrollments).where(sql`${enrollments.enrolledAt}::date = ${yISO}`);
    const [pq] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(questions).where(eq(questions.status, "pending"));
    const [idle] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(enrollments).where(and(isNull(enrollments.startedAt), sql`${enrollments.enrolledAt} < now() - interval '7 days'`));
    const to = [smtp.reportEmail, ...(await adminEmails())].filter(Boolean);
    if (to.length) {
      await sendMail({
        type: "daily_report",
        to,
        subject: `Günlük rapor — ${fmtDate(y)}`,
        html: emailTemplate({
          title: `Dün ne oldu? (${fmtDate(y)})`,
          html: `<ul><li>Yeni soru: <b>${nq.n}</b></li><li>Görev teslimi: <b>${ns.n}</b></li><li>Sınav sonucu: <b>${nqa.n}</b></li><li>Yeni kayıt: <b>${ne.n}</b></li></ul><h3>Dikkat gerektirenler</h3><ul><li>Yanıtlanmamış soru: <b>${pq.n}</b></li><li>Satın aldı ama 7 gündür başlamadı: <b>${idle.n}</b></li></ul>`,
          buttonText: "Yönetim paneli",
          buttonUrl: siteUrl("/admin"),
        }),
      });
    }
  }
  // Eğitmenlere kendi kurslarıyla sınırlı günlük özet
  if (smtp.dailyReportEnabled) {
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yISO = y.toISOString().slice(0, 10);
    const teachers = await db.select().from(users).where(eq(users.role, "teacher"));
    for (const t of teachers) {
      const [prof] = await db.select({ id: instructors.id }).from(instructors).where(eq(instructors.userId, t.id)).limit(1);
      const cs = await db.select({ id: courses.id }).from(courses).where(prof ? sql`${courses.authorId} = ${t.id} or ${courses.instructorId} = ${prof.id}` : eq(courses.authorId, t.id));
      const ids = cs.map((c) => c.id);
      if (!ids.length) continue;
      const [nq] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(questions).where(and(inArray(questions.courseId, ids), sql`${questions.createdAt}::date = ${yISO}`));
      const [ns] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(assignmentSubmissions).innerJoin(assignments, eq(assignmentSubmissions.assignmentId, assignments.id)).where(and(inArray(assignments.courseId, ids), sql`${assignmentSubmissions.submittedAt}::date = ${yISO}`));
      const [ne] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(enrollments).where(and(inArray(enrollments.courseId, ids), sql`${enrollments.enrolledAt}::date = ${yISO}`));
      const [pq] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(questions).where(and(inArray(questions.courseId, ids), eq(questions.status, "pending")));
      if (nq.n + ns.n + ne.n + pq.n === 0) continue;
      await sendMail({ type: "daily_report", to: t.email, subject: `Günlük özet — ${fmtDate(y)}`, html: emailTemplate({ title: `Dün kurslarında ne oldu? (${fmtDate(y)})`, html: `<ul><li>Yeni soru: <b>${nq.n}</b></li><li>Görev teslimi: <b>${ns.n}</b></li><li>Yeni kayıt: <b>${ne.n}</b></li><li>Yanıt bekleyen soru: <b>${pq.n}</b></li></ul>`, buttonText: "Eğitmen paneli", buttonUrl: siteUrl("/egitmen") }) });
    }
  }
  await pruneKeys();
  return { dueSent, eventSent };
}

