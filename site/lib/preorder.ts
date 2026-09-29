import "server-only";
import { and, eq, isNull, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { courses, enrollments, users } from "@/db/schema";
import { isPreorder } from "@/lib/course-logic";
import { sendMail, emailTemplate, siteUrl, escapeHtml } from "@/lib/mailer";
import { notifyUser } from "@/lib/notify";
import { todayISO } from "@/lib/format";

// Erken kayıt: eğitim açılış tarihine kadar satın alınabilir ama izlenemez (lib/course-logic.ts isPreorder).
// Açılış anında kayıtlı öğrencilere bir kez haber verilir (courses.openNotifiedAt).

/**
 * Öğrencinin kaydı açılışı bekliyor mu: erken kayıt dönemi sürüyor ve öğrenci eğitime hiç başlamamış.
 * Başlamış öğrenci (startedAt dolu) kilitlenmez: yayındaki bir eğitim sonradan erken kayda çevrilirse mevcut öğrenciler erişimini korur.
 */
export function awaitsOpening(course: { preorder?: boolean | null; opensAt?: string | null }, enrollment: { startedAt: Date | null } | null | undefined) {
  return isPreorder(course) && !enrollment?.startedAt;
}

/**
 * Eğitim açıldıysa (erken kayıt dönemi bittiyse) kayıtlı, henüz başlamamış öğrencilere e-posta + bildirim gönderir.
 * Eğitim başına bir kez çalışır; cron (açılış günü) ve saveCourse (yönetici erken açarsa) çağırır.
 */
export async function notifyPreorderOpened(courseId: number): Promise<number> {
  const [c] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c || c.status !== "published" || c.closed || c.comingSoon) return 0;
  if (isPreorder(c) || c.openNotifiedAt) return 0;
  // Önce işaretle: aynı anda iki çağrı gelirse ikincisi göndermesin
  const marked = await db.update(courses).set({ openNotifiedAt: new Date() }).where(and(eq(courses.id, courseId), isNull(courses.openNotifiedAt))).returning({ id: courses.id });
  if (marked.length === 0) return 0;

  const students = await db
    .select({ userId: enrollments.userId, email: users.email, firstName: users.firstName })
    .from(enrollments)
    .innerJoin(users, eq(enrollments.userId, users.id))
    .where(and(eq(enrollments.courseId, courseId), eq(enrollments.status, "active"), isNull(enrollments.startedAt)));
  const url = `/kurs-izle/${c.id}`;
  for (const s of students) {
    await notifyUser(s.userId, { title: "Eğitimin açıldı", body: `${c.title} artık aktif; hemen başlayabilirsin.`, url, tag: `open-${c.id}` });
    await sendMail({
      type: "preorder_open",
      to: s.email,
      subject: `${c.title} açıldı, başlayabilirsin`,
      html: emailTemplate({
        title: "Erken kayıt olduğun eğitim açıldı!",
        html: `<p>Merhaba ${escapeHtml(s.firstName || "")},</p><p>Erken kayıt olduğun <b>${escapeHtml(c.title)}</b> eğitimi açıldı. Kitaplığında aktifleşti; hemen başlayabilirsin.</p>`,
        buttonText: "Eğitime başla",
        buttonUrl: siteUrl(url),
      }),
    });
  }
  return students.length;
}

/** Cron: açılış tarihi gelmiş, henüz haber verilmemiş erken kayıt eğitimleri */
export async function runPreorderOpenings(): Promise<number> {
  const due = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.preorder, true), isNotNull(courses.opensAt), lte(courses.opensAt, todayISO()), isNull(courses.openNotifiedAt), eq(courses.status, "published")));
  let sent = 0;
  for (const c of due) sent += await notifyPreorderOpened(c.id);
  return sent;
}

/** Açılışı bekleyen (erken kayıt dönemi süren) eğitim id'leri → açılış tarihi; panel/cron filtreleri için */
export async function pendingPreorderCourses(): Promise<Map<number, string>> {
  const rows = await db.select({ id: courses.id, preorder: courses.preorder, opensAt: courses.opensAt }).from(courses).where(and(eq(courses.preorder, true), isNotNull(courses.opensAt)));
  return new Map(rows.filter((r) => isPreorder(r)).map((r) => [r.id, r.opensAt!]));
}
