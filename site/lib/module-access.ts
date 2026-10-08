import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { assignments, courses, enrollments, lessons, moduleOpenings, modules, periodEnrollments, periods, quizzes, sentKeys, users, type ModuleUnlockMode } from "@/db/schema";
import { deadlineOf, moduleIsOpen, moduleOpensAt, taskBase, type TaskBase } from "@/lib/course-logic";
import { notArchived } from "@/lib/data/course-filters";
import { notifyUsers } from "@/lib/notify";
import { sendMail, emailTemplate, siteUrl, escapeHtml } from "@/lib/mailer";
import { todayISO } from "@/lib/format";

/**
 * Modül açılışı — sunucu tarafı (kural: lib/course-logic.ts moduleOpensAt).
 * Takvimli kursta açılış DÖNEM bazındadır: bir kursun aynı anda birden çok dönemi olabilir ("Dönem kopyala"),
 * her dönem kendi takvimine göre açılır; yönetici manuel açışı da dönem için yapar. Esnek kursta taban öğrencinin
 * eğitime başladığı andır (manuel mod esnek kursta kullanılmaz).
 */

export type ModuleState = { moduleId: number; mode: ModuleUnlockMode; opensAt: Date | null; open: boolean };
export type ModRow = { id: number; courseId: number; unlockMode: ModuleUnlockMode | string; unlockDays: number; unlockTime: string | null };

const gated = (m: { unlockMode: string }) => m.unlockMode === "manual" || m.unlockMode === "scheduled";

/** Öğrencinin kursta kayıtlı olduğu dönem (en erken başlayan; studentTaskBase ile aynı seçim) */
async function studentPeriod(userId: number, courseId: number) {
  const [pe] = await db
    .select({ id: periods.id, startDate: periods.startDate, startTime: periods.startTime })
    .from(periodEnrollments)
    .innerJoin(periods, eq(periodEnrollments.periodId, periods.id))
    .where(and(eq(periodEnrollments.userId, userId), eq(periods.courseId, courseId)))
    .orderBy(asc(periods.startDate))
    .limit(1);
  return pe ?? null;
}

/**
 * Öğrenci için modül durumları. Önizlemede (eğitmen/yönetici) çağrılmaz; orada her modül açıktır.
 * Dönemi olmayan kayıtta (yöneticinin dönemsiz eklediği öğrenci) manuel modül herhangi bir dönemde açıldıysa açık sayılır,
 * zamanlı modül öğrencinin başlangıcına göre hesaplanır.
 */
export async function studentModuleStates(userId: number, courseId: number, mods: ModRow[], startedAt?: Date | null): Promise<Map<number, ModuleState>> {
  const out = new Map<number, ModuleState>();
  const now = Date.now();
  for (const m of mods) out.set(m.id, { moduleId: m.id, mode: (m.unlockMode as ModuleUnlockMode) || "open", opensAt: new Date(0), open: true });
  const g = mods.filter(gated);
  if (g.length === 0) return out;

  const period = await studentPeriod(userId, courseId);
  let base: TaskBase;
  if (period) base = taskBase({ periodStartDate: period.startDate, periodStartTime: period.startTime });
  else {
    let st = startedAt;
    if (st === undefined) {
      const [e] = await db.select({ startedAt: enrollments.startedAt }).from(enrollments).where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))).limit(1);
      st = e?.startedAt ?? null;
    }
    base = taskBase({ startedAt: st });
  }
  const ids = g.map((m) => m.id);
  const rows = await db
    .select({ moduleId: moduleOpenings.moduleId, periodId: moduleOpenings.periodId, opensAt: moduleOpenings.opensAt })
    .from(moduleOpenings)
    .where(period ? and(inArray(moduleOpenings.moduleId, ids), eq(moduleOpenings.periodId, period.id)) : inArray(moduleOpenings.moduleId, ids));
  for (const m of g) {
    let override: Date | null = null;
    if (period) override = rows.find((r) => r.moduleId === m.id)?.opensAt ?? null;
    else if (m.unlockMode === "manual") {
      // Dönemsiz kayıt: herhangi bir dönemde açıldıysa en erken açılış geçerli
      const opened = rows.filter((r) => r.moduleId === m.id && r.opensAt).map((r) => r.opensAt!.getTime());
      override = opened.length ? new Date(Math.min(...opened)) : null;
    }
    const at = moduleOpensAt(m, { base, override });
    out.set(m.id, { moduleId: m.id, mode: m.unlockMode as ModuleUnlockMode, opensAt: at, open: moduleIsOpen(at, now) });
  }
  return out;
}

/**
 * Öğrenci için KAPALI modüllerdeki ders id'leri; panel listeleri (Aksiyonlarım/Gündemim) ve cron hatırlatmaları
 * bu derslerin görev/sınavlarını göstermez. Kapılı modülü olmayan kurslarda tek sorguyla boş döner.
 */
export async function closedLessonIds(userId: number, courseIds: number[]): Promise<Set<number>> {
  const out = new Set<number>();
  if (courseIds.length === 0) return out;
  const g = await db
    .select({ id: modules.id, courseId: modules.courseId, unlockMode: modules.unlockMode, unlockDays: modules.unlockDays, unlockTime: modules.unlockTime })
    .from(modules)
    .where(and(inArray(modules.courseId, courseIds), ne(modules.unlockMode, "open")));
  if (g.length === 0) return out;
  const byCourse = new Map<number, ModRow[]>();
  for (const m of g) byCourse.set(m.courseId, [...(byCourse.get(m.courseId) ?? []), m]);
  const closed: number[] = [];
  for (const [courseId, mods] of byCourse) {
    const st = await studentModuleStates(userId, courseId, mods);
    for (const s of st.values()) if (!s.open) closed.push(s.moduleId);
  }
  if (closed.length === 0) return out;
  const ls = await db.select({ id: lessons.id }).from(lessons).where(inArray(lessons.moduleId, closed));
  for (const l of ls) out.add(l.id);
  return out;
}

export type PeriodModuleState = {
  periodId: number;
  moduleId: number;
  mode: ModuleUnlockMode;
  /** Hesaplanan açılış (manuelde elle açılış anı; zamanlıda göreli ya da dönem için belirlenen tarih) */
  opensAt: Date | null;
  open: boolean;
  /** Dönem için elle belirlenmiş tarih (manuel açış ya da zamanlıda üzerine yazma) */
  override: Date | null;
  notifiedAt: Date | null;
  /** Modülde teslim tarihi açılıştan önce olan (ya da açılış belirsizken tarihi geçmiş) görev/sınav başlıkları */
  lateTasks: string[];
};

/** Yönetici görünümü: dönem × modül durumları (yalnızca kapılı modüller) */
export async function periodModuleStates(courseId: number): Promise<PeriodModuleState[]> {
  const [mods, prds] = await Promise.all([
    db.select().from(modules).where(and(eq(modules.courseId, courseId), ne(modules.unlockMode, "open"))).orderBy(asc(modules.sortOrder), asc(modules.id)),
    db.select({ id: periods.id, startDate: periods.startDate, startTime: periods.startTime }).from(periods).where(eq(periods.courseId, courseId)).orderBy(asc(periods.startDate), asc(periods.id)),
  ]);
  if (mods.length === 0 || prds.length === 0) return [];
  const ids = mods.map((m) => m.id);
  const [rows, asg, qz] = await Promise.all([
    db.select().from(moduleOpenings).where(inArray(moduleOpenings.moduleId, ids)),
    db.select({ moduleId: lessons.moduleId, title: assignments.title, due: assignments.dueDate }).from(assignments).innerJoin(lessons, eq(assignments.lessonId, lessons.id)).where(and(inArray(lessons.moduleId, ids), eq(assignments.status, "active"), isNotNull(assignments.dueDate))),
    db.select({ moduleId: lessons.moduleId, title: quizzes.title, due: quizzes.endDate }).from(quizzes).innerJoin(lessons, eq(quizzes.lessonId, lessons.id)).where(and(inArray(lessons.moduleId, ids), eq(quizzes.status, "active"), isNotNull(quizzes.endDate))),
  ]);
  const tasks = [...asg, ...qz].map((t) => ({ moduleId: t.moduleId, title: t.title, due: deadlineOf(t.due) }));
  const now = Date.now();
  const out: PeriodModuleState[] = [];
  for (const p of prds) {
    const base = taskBase({ periodStartDate: p.startDate, periodStartTime: p.startTime });
    for (const m of mods) {
      const row = rows.find((r) => r.moduleId === m.id && r.periodId === p.id);
      const at = moduleOpensAt(m, { base, override: row?.opensAt ?? null });
      const late = tasks
        .filter((t) => t.moduleId === m.id && t.due)
        .filter((t) => (at ? t.due!.getTime() < at.getTime() : t.due!.getTime() < now))
        .map((t) => t.title);
      out.push({ periodId: p.id, moduleId: m.id, mode: m.unlockMode, opensAt: at, open: moduleIsOpen(at, now), override: row?.opensAt ?? null, notifiedAt: row?.notifiedAt ?? null, lateTasks: late });
    }
  }
  return out;
}

async function once(key: string) {
  const r = await db.insert(sentKeys).values({ key }).onConflictDoNothing().returning({ key: sentKeys.key });
  return r.length > 0;
}

async function sendOpenedMail(students: { userId: number; email: string; firstName: string | null }[], course: { id: number; title: string }, moduleTitle: string) {
  const url = `/kurs-izle/${course.id}`;
  await notifyUsers(students.map((s) => s.userId), { title: "Yeni modül açıldı", body: `${moduleTitle} · ${course.title}`, url, tag: `mod-${course.id}` });
  for (const s of students) {
    await sendMail({
      type: "module_open",
      to: s.email,
      subject: `${course.title}: "${moduleTitle}" modülü açıldı`,
      html: emailTemplate({
        title: "Yeni modül açıldı",
        html: `<p>Merhaba ${escapeHtml(s.firstName || "")},</p><p><b>${escapeHtml(course.title)}</b> eğitiminde <b>${escapeHtml(moduleTitle)}</b> modülü erişime açıldı. Kaldığın yerden devam edebilirsin.</p>`,
        buttonText: "Eğitime devam et",
        buttonUrl: siteUrl(url),
      }),
    });
  }
}

/**
 * Dönemdeki aktif öğrencilere "modül açıldı" haberi (uygulama içi + push + e-posta). Modül×dönem için bir kez
 * (module_openings.notifiedAt): yönetici "Şimdi aç" dediğinde ve cron'da açılış saati gelince çağrılır.
 * Yalnızca yayındaki eğitimde gönderir.
 */
export async function notifyModuleOpened(moduleId: number, periodId: number): Promise<number> {
  const [row] = await db
    .select({ m: modules, c: { id: courses.id, title: courses.title, status: courses.status } })
    .from(modules)
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(modules.id, moduleId))
    .limit(1);
  if (!row || row.c.status !== "published") return 0;
  // Önce işaretle: aynı anda iki çağrı gelirse yalnızca biri gönderir
  const marked = await db
    .insert(moduleOpenings)
    .values({ moduleId, periodId, notifiedAt: new Date() })
    .onConflictDoUpdate({ target: [moduleOpenings.moduleId, moduleOpenings.periodId], set: { notifiedAt: new Date() }, setWhere: isNull(moduleOpenings.notifiedAt) })
    .returning({ id: moduleOpenings.id });
  if (marked.length === 0) return 0;
  const students = await db
    .select({ userId: users.id, email: users.email, firstName: users.firstName })
    .from(periodEnrollments)
    .innerJoin(enrollments, and(eq(enrollments.userId, periodEnrollments.userId), eq(enrollments.courseId, row.c.id), eq(enrollments.status, "active")))
    .innerJoin(users, eq(users.id, periodEnrollments.userId))
    .where(eq(periodEnrollments.periodId, periodId));
  if (students.length) await sendOpenedMail(students, row.c, row.m.title);
  return students.length;
}

/**
 * Cron (15 dk): açılış saati gelen modüller için haber verir. Kilit zamana göre hesaplandığından açılışın kendisi
 * cron'a bağlı değildir; cron yalnızca bildirimi gönderir.
 *  - Takvimli kurs: bitmemiş dönemlerde modül×dönem, bir kez (notifiedAt).
 *  - Esnek kurs: zamanlı modül öğrenci bazında; son 24 saat içinde açılanlar, öğrenci+modül için bir kez (sent_keys).
 */
export async function runModuleOpenings(): Promise<number> {
  let sent = 0;
  const now = Date.now();
  const g = await db
    .select({ m: modules, courseId: courses.id })
    .from(modules)
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(and(ne(modules.unlockMode, "open"), eq(courses.status, "published"), notArchived, eq(courses.type, "course")));
  if (g.length === 0) return 0;
  const courseIds = [...new Set(g.map((x) => x.courseId))];
  const prds = await db
    .select({ id: periods.id, courseId: periods.courseId, startDate: periods.startDate, startTime: periods.startTime })
    .from(periods)
    .where(and(inArray(periods.courseId, courseIds), gte(periods.endDate, todayISO())));
  const rows = await db.select().from(moduleOpenings).where(inArray(moduleOpenings.moduleId, g.map((x) => x.m.id)));
  const withPeriods = new Set((await db.select({ courseId: periods.courseId }).from(periods).where(inArray(periods.courseId, courseIds))).map((r) => r.courseId));

  for (const { m } of g) {
    if (withPeriods.has(m.courseId)) {
      for (const p of prds.filter((p) => p.courseId === m.courseId)) {
        const row = rows.find((r) => r.moduleId === m.id && r.periodId === p.id);
        if (row?.notifiedAt) continue;
        const at = moduleOpensAt(m, { base: taskBase({ periodStartDate: p.startDate, periodStartTime: p.startTime }), override: row?.opensAt ?? null });
        if (moduleIsOpen(at, now)) sent += await notifyModuleOpened(m.id, p.id);
      }
      continue;
    }
    if (m.unlockMode !== "scheduled") continue;
    const [c] = await db.select({ id: courses.id, title: courses.title }).from(courses).where(eq(courses.id, m.courseId)).limit(1);
    if (!c) continue;
    const studs = await db
      .select({ userId: users.id, email: users.email, firstName: users.firstName, startedAt: enrollments.startedAt })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.userId))
      .where(and(eq(enrollments.courseId, m.courseId), eq(enrollments.status, "active"), isNotNull(enrollments.startedAt)));
    for (const s of studs) {
      const at = moduleOpensAt(m, { base: taskBase({ startedAt: s.startedAt }) });
      if (!moduleIsOpen(at, now) || at!.getTime() < now - 24 * 3600_000) continue;
      if (!(await once(`modopen:${m.id}:${s.userId}`))) continue;
      await sendOpenedMail([s], c, m.title);
      sent++;
    }
  }
  return sent;
}

/** Yönetici: dönem için modülü şimdi açar (manuel) ya da zamanlı modülde tarihi şimdiye çeker; öğrencilere hemen haber verir */
export async function openModuleNow(moduleId: number, periodId: number, byUserId: number) {
  await setModuleOpening(moduleId, periodId, new Date(), byUserId);
  return notifyModuleOpened(moduleId, periodId);
}

/** Yönetici: dönem için açılış tarihi belirler (null = manuelde kapat / zamanlıda göreli kurala dön). Bildirim yeniden gönderilebilir olur. */
export async function setModuleOpening(moduleId: number, periodId: number, opensAt: Date | null, byUserId: number) {
  await db
    .insert(moduleOpenings)
    .values({ moduleId, periodId, opensAt, openedBy: byUserId, notifiedAt: null, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [moduleOpenings.moduleId, moduleOpenings.periodId], set: { opensAt, openedBy: byUserId, notifiedAt: null, updatedAt: new Date() } });
}

