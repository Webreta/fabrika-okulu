import "server-only";
import { and, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { notArchived } from "@/lib/data/course-filters";
import {
  assignments, assignmentSubmissions, enrollments, periodEnrollments, periods, courses, users, sentKeys, questions, quizAttempts,
} from "@/db/schema";
import { taskDue, deadlineOf } from "@/lib/course-logic";
import { studentTaskBase } from "@/lib/data/student";
import { notifyUser, logNotification } from "@/lib/notify";
import { sendMail, emailTemplate, siteUrl, adminEmails, escapeHtml, safeMailUrl } from "@/lib/mailer";
import { fmtDateTime, fmtDate, todayISO, isoDay, addDays } from "@/lib/format";
import { getSetting, getRawSetting, setRawSetting } from "@/lib/settings";
import { instructors } from "@/db/schema";
import { runPreorderOpenings, pendingPreorderCourses } from "@/lib/preorder";
import { expirePendingOrders } from "@/lib/orders";
import { runModuleOpenings, closedLessonIds } from "@/lib/module-access";

/** Aynı hatırlatmayı tekrar göndermemek için */
async function once(key: string): Promise<boolean> {
  const r = await db.insert(sentKeys).values({ key }).onConflictDoNothing().returning({ key: sentKeys.key });
  return r.length > 0;
}

async function pruneKeys() {
  await db.delete(sentKeys).where(sql`${sentKeys.createdAt} < now() - interval '7 days'`);
}

/** Günlük işlerin en erken çalıştığı saat (sunucunun yerel saati) */
export const DAILY_HOUR = 7;

/** Zamanlayıcı izleri (Ayarlar → Sistem sağlığı bunları gösterir) */
export type CronTick = { at: string };
export type CronDailyLast = { day: string; at: string };

export async function markCronTick() {
  await setRawSetting("cron_last_tick", { at: new Date().toISOString() } satisfies CronTick);
}

export async function cronStatus() {
  const [tick, daily] = await Promise.all([
    getRawSetting<CronTick | null>("cron_last_tick", null),
    getRawSetting<CronDailyLast | null>("cron_daily_last", null),
  ]);
  return { tick, daily };
}

/** Her 15 dk: canlı oturum 45-90 dk kala + görev son 1 saat */
export async function runFrequent() {
  let sent = 0;
  const now = Date.now();
  const today = todayISO();
  // Erken kayıt: açılış günü gelen eğitimler için "eğitimin açıldı" haberi (gece yarısı değil, sabah 08:00'den sonra)
  if (new Date().getHours() >= 8) sent += await runPreorderOpenings();
  // Açılış saati gelen modüller için "yeni modül açıldı" haberi (kilit zamana göre hesaplanır; cron yalnızca haber verir)
  sent += await runModuleOpenings();
  // Süresi dolan bekleyen havale siparişleri iptal edilir (koltuk ve kupon serbest kalır)
  sent += await expirePendingOrders();
  // Açılışı bekleyen eğitimlerde hatırlatma gönderilmez
  const waiting = await pendingPreorderCourses();
  // Canlı oturum
  const pes = await db
    .select({ userId: periodEnrollments.userId, p: periods, courseTitle: courses.title })
    .from(periodEnrollments)
    .innerJoin(periods, eq(periodEnrollments.periodId, periods.id))
    .innerJoin(courses, eq(periods.courseId, courses.id))
    // Yalnızca bugün oturumu olan dönemler (tüm dönem kayıtları gezilmez)
    .where(sql`${periods.schedule} @> ${JSON.stringify([{ date: today }])}::jsonb`);
  for (const { userId, p, courseTitle } of pes) {
    if (waiting.has(p.courseId)) continue;
    for (const [i, s] of (p.schedule ?? []).entries()) {
      if (s.date !== today || !s.time) continue;
      const start = new Date(`${s.date}T${s.time}:00`).getTime();
      const diff = (start - now) / 60000;
      if (diff < 45 || diff > 90) continue;
      if (!(await once(`sess:${p.id}:${i}:${s.date}:${userId}`))) continue;
      await notifyUser(userId, { title: "Birazdan canlı oturumun var", body: `${s.title || "Canlı oturum"} · ${s.time} · ${courseTitle}`, url: s.link || "/panel/takvim", tag: `sess-${p.id}-${i}` });
      sent++;
    }
  }
  // Görev son 1 saat (göreli süreli veya mutlak tarihli). Mutlak tarihlilerde yalnızca tarihi yakın olanlar okunur
  // (pay geniş tutuldu: saatsiz tarih gün sonuna tamamlanır)
  const asg = await db.select().from(assignments).where(and(eq(assignments.status, "active"), or(gt(assignments.extraDays, 0), and(isNotNull(assignments.dueDate), sql`${assignments.dueDate} between now() - interval '2 days' and now() + interval '2 days'`))));
  for (const a of asg) {
    if (waiting.has(a.courseId)) continue;
    const students = await db
      .select({ userId: enrollments.userId })
      .from(enrollments)
      .where(and(eq(enrollments.courseId, a.courseId), eq(enrollments.status, "active")));
    const subs = await db.select({ userId: assignmentSubmissions.userId }).from(assignmentSubmissions).where(eq(assignmentSubmissions.assignmentId, a.id));
    const submitted = new Set(subs.map((s) => s.userId));
    for (const { userId } of students) {
      if (submitted.has(userId)) continue;
      // Henüz açılmamış modüldeki görev hatırlatılmaz
      if (a.lessonId && (await closedLessonIds(userId, [a.courseId])).has(a.lessonId)) continue;
      const due = a.extraDays > 0 ? taskDue(await studentTaskBase(userId, a.courseId), a.extraDays) : deadlineOf(a.dueDate);
      if (!due) continue;
      const diff = (due.getTime() - now) / 60000;
      if (diff < -15 || diff > 60) continue;
      if (!(await once(`due1h:${a.id}:${userId}:${today}`))) continue;
      await notifyUser(userId, { title: "Görevde son 1 saat", body: `${a.title} · ${fmtDateTime(due)}`, url: `/kurs-izle/${a.courseId}?gorev=${a.id}`, tag: `due-${a.id}` });
      sent++;
    }
  }
  return sent;
}

/**
 * Günlük işler saat 07:00'de değil, 07:00'den SONRAKİ ilk çağrıda çalışır: sunucu o saatte kapalıysa/yeniden başlıyorsa
 * gün kaybolmaz, açılınca telafi edilir. Aynı gün ikinci kez çalışmaz (`runDaily` içindeki gün kilidi).
 */
export async function runDailyIfDue(force = false) {
  if (!force && new Date().getHours() < DAILY_HOUR) return { skipped: true };
  return runDaily();
}

/** Günlük: yarınki görev/oturum hatırlatmaları + günlük rapor. Günde bir kez çalışır. */
export async function runDaily() {
  const today = todayISO();
  // Gün kilidi işten ÖNCE alınır (tek satırlık atomik ekleme): üst üste binen iki çağrıdan yalnızca biri çalışır,
  // iş yarıda kesilse bile aynı gün için e-postalar ikinci kez gönderilmez.
  if (!(await once(`daily:${today}`))) return { skipped: true };
  await setRawSetting("cron_daily_last", { day: today, at: new Date().toISOString() } satisfies CronDailyLast);
  // Yerel gün hesabı (toISOString UTC gününü verir)
  const tISO = addDays(today, 1);
  let dueSent = 0, eventSent = 0;
  const waiting = await pendingPreorderCourses();

  // Yarın biten görevler (göreli süreli veya mutlak tarihli; mutlak tarihlilerde yalnızca tarihi yakın olanlar okunur)
  const asg = await db.select().from(assignments).where(and(eq(assignments.status, "active"), or(gt(assignments.extraDays, 0), and(isNotNull(assignments.dueDate), sql`${assignments.dueDate} between now() - interval '2 days' and now() + interval '3 days'`))));
  for (const a of asg) {
    if (waiting.has(a.courseId)) continue;
    const students = await db
      .select({ userId: enrollments.userId, email: users.email, name: users.firstName })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.userId, users.id))
      .where(and(eq(enrollments.courseId, a.courseId), eq(enrollments.status, "active")));
    const subs = new Set((await db.select({ userId: assignmentSubmissions.userId }).from(assignmentSubmissions).where(eq(assignmentSubmissions.assignmentId, a.id))).map((s) => s.userId));
    for (const s of students) {
      if (subs.has(s.userId)) continue;
      // Henüz açılmamış modüldeki görev hatırlatılmaz
      if (a.lessonId && (await closedLessonIds(s.userId, [a.courseId])).has(a.lessonId)) continue;
      const due = a.extraDays > 0 ? taskDue(await studentTaskBase(s.userId, a.courseId), a.extraDays) : deadlineOf(a.dueDate);
      if (!due || isoDay(due) !== tISO) continue;
      const url = `/kurs-izle/${a.courseId}?gorev=${a.id}`;
      await notifyUser(s.userId, { title: "Teslim yaklaşıyor", body: `${a.title} · yarın ${fmtDateTime(due)}`, url, tag: `due-${a.id}` });
      await sendMail({ type: "due_reminder", to: s.email, subject: `Görev son teslim yarın: ${a.title}`, html: emailTemplate({ title: "Teslim yaklaşıyor", html: `<p>Merhaba ${escapeHtml(s.name)},</p><p><b>${escapeHtml(a.title)}</b> görevinin son teslimi <b>${fmtDateTime(due)}</b>.</p>`, buttonText: "Göreve git", buttonUrl: siteUrl(url) }) });
      dueSent++;
    }
  }
  // Yarınki oturumlar
  const pes = await db
    .select({ userId: periodEnrollments.userId, email: users.email, name: users.firstName, p: periods, courseTitle: courses.title })
    .from(periodEnrollments)
    .innerJoin(periods, eq(periodEnrollments.periodId, periods.id))
    .innerJoin(courses, eq(periods.courseId, courses.id))
    .innerJoin(users, eq(periodEnrollments.userId, users.id))
    // Yalnızca yarın oturumu olan dönemler
    .where(sql`${periods.schedule} @> ${JSON.stringify([{ date: tISO }])}::jsonb`);
  const byUser = new Map<number, { email: string; name: string; items: string[] }>();
  for (const r of pes) {
    if (waiting.has(r.p.courseId)) continue;
    const items = (r.p.schedule ?? []).filter((s) => s.date === tISO);
    if (!items.length) continue;
    const u = byUser.get(r.userId) ?? { email: r.email, name: r.name, items: [] };
    for (const s of items) u.items.push(`<li><b>${escapeHtml(s.time || "")}</b> ${escapeHtml(s.title || "Canlı oturum")} — ${escapeHtml(r.courseTitle)}${safeMailUrl(s.link) ? ` · <a href="${safeMailUrl(s.link)}">Katıl</a>` : ""}</li>`);
    byUser.set(r.userId, u);
  }
  for (const [userId, u] of byUser) {
    await sendMail({ type: "event_reminder", to: u.email, subject: `Yarınki etkinliklerin (${u.items.length})`, html: emailTemplate({ title: `Yarın ${u.items.length} etkinliğin var`, html: `<p>Merhaba ${escapeHtml(u.name)},</p><ul>${u.items.join("")}</ul>`, buttonText: "Takvimim", buttonUrl: siteUrl("/panel/takvim") }) });
    await notifyUser(userId, { title: "Yarın canlı oturumun var", body: `${u.items.length} etkinlik`, url: "/panel/takvim", tag: `ev-${tISO}` });
    eventSent++;
  }
  await logNotification({ channel: "reminder", title: "Günlük hatırlatmalar", target: "öğrenciler", sentCount: dueSent + eventSent });

  // Günlük rapor (dün)
  const smtp = await getSetting("smtp");
  if (smtp.dailyReportEnabled) {
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yISO = isoDay(y);
    const [nq] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(questions).where(sql`${questions.createdAt}::date = ${yISO}`);
    const [ns] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(assignmentSubmissions).where(sql`${assignmentSubmissions.submittedAt}::date = ${yISO}`);
    const [nqa] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(quizAttempts).where(sql`${quizAttempts.completedAt}::date = ${yISO}`);
    const [ne] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(enrollments).where(sql`${enrollments.enrolledAt}::date = ${yISO}`);
    const [pq] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(questions).where(eq(questions.status, "pending"));
    // Açılışı bekleyen erken kayıtlar "başlamadı" sayılmaz
    const [idle] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(enrollments).where(and(isNull(enrollments.startedAt), sql`${enrollments.enrolledAt} < now() - interval '7 days'`, sql`${enrollments.courseId} not in (select id from courses where preorder and opens_at > current_date)`));
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
    const yISO = isoDay(y);
    const teachers = await db.select().from(users).where(eq(users.role, "teacher"));
    for (const t of teachers) {
      const [prof] = await db.select({ id: instructors.id }).from(instructors).where(eq(instructors.userId, t.id)).limit(1);
      const cs = await db.select({ id: courses.id }).from(courses).where(and(notArchived, prof ? sql`${courses.authorId} = ${t.id} or ${courses.instructorId} = ${prof.id}` : eq(courses.authorId, t.id)));
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

