import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { courses, periodWaitlist, periods, periodEnrollments, users } from "@/db/schema";
import { sendMail, emailTemplate, siteUrl } from "@/lib/mailer";
import { notifyUser } from "@/lib/notify";
import { openPeriods, getCoursePeriods } from "@/lib/data/courses";
import { fmtRange } from "@/lib/format";

/** Kayıt açık ve boş yeri olan dönemler */
export async function availablePeriods(courseId: number) {
  const list = openPeriods(await getCoursePeriods(courseId));
  return list.filter((p) => p.enrolled < p.capacity);
}

/** Dönemin anlık doluluk durumu (sepet, ödeme ve kayıt aşamalarında ortak kontrol) */
export async function periodCapacity(periodId: number, courseId?: number) {
  const [p] = await db
    .select({
      id: periods.id,
      courseId: periods.courseId,
      name: periods.name,
      capacity: periods.capacity,
      enrolled: sql<number>`(select count(*) from ${periodEnrollments} pe where pe.period_id = "periods"."id")`.mapWith(Number),
    })
    .from(periods)
    .where(courseId ? and(eq(periods.id, periodId), eq(periods.courseId, courseId)) : eq(periods.id, periodId))
    .limit(1);
  if (!p) return null;
  return { ...p, full: p.enrolled >= p.capacity, left: Math.max(0, p.capacity - p.enrolled) };
}

/** Listeye ekle (kurs + e-posta tekil). Daha önce haber verilmişse tekrar beklemeye alınır. */
export async function joinWaitlist(opts: { courseId: number; periodId?: number | null; userId?: number | null; email: string; name?: string }) {
  const email = opts.email.trim().toLowerCase();
  if (!email) return false;
  await db
    .insert(periodWaitlist)
    .values({ courseId: opts.courseId, periodId: opts.periodId ?? null, userId: opts.userId ?? null, email, name: (opts.name ?? "").trim().slice(0, 120) })
    .onConflictDoUpdate({
      target: [periodWaitlist.courseId, periodWaitlist.email],
      set: { periodId: opts.periodId ?? null, userId: opts.userId ?? null, name: (opts.name ?? "").trim().slice(0, 120), notifiedAt: null, createdAt: new Date() },
    });
  return true;
}

export async function isOnWaitlist(courseId: number, email: string) {
  const [r] = await db
    .select({ id: periodWaitlist.id, notifiedAt: periodWaitlist.notifiedAt })
    .from(periodWaitlist)
    .where(and(eq(periodWaitlist.courseId, courseId), eq(periodWaitlist.email, email.trim().toLowerCase())))
    .limit(1);
  return !!r && !r.notifiedAt;
}

export async function leaveWaitlist(courseId: number, email: string) {
  await db.delete(periodWaitlist).where(and(eq(periodWaitlist.courseId, courseId), eq(periodWaitlist.email, email.trim().toLowerCase())));
}

/** Kursun bekleme listesi (eğitmen/yönetici paneli) */
export async function courseWaitlist(courseId: number) {
  const rows = await db
    .select({
      id: periodWaitlist.id,
      email: periodWaitlist.email,
      name: periodWaitlist.name,
      userId: periodWaitlist.userId,
      periodName: periods.name,
      createdAt: periodWaitlist.createdAt,
      notifiedAt: periodWaitlist.notifiedAt,
      userFirst: users.firstName,
      userLast: users.lastName,
    })
    .from(periodWaitlist)
    .leftJoin(periods, eq(periodWaitlist.periodId, periods.id))
    .leftJoin(users, eq(periodWaitlist.userId, users.id))
    .where(eq(periodWaitlist.courseId, courseId))
    .orderBy(sql`${periodWaitlist.notifiedAt} nulls first`, periodWaitlist.createdAt);
  return rows.map((r) => ({ ...r, name: r.name || `${r.userFirst ?? ""} ${r.userLast ?? ""}`.trim() }));
}

export async function waitlistCount(courseId: number) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(periodWaitlist)
    .where(and(eq(periodWaitlist.courseId, courseId), isNull(periodWaitlist.notifiedAt)));
  return n;
}

/**
 * Kursta boş yer açıldıysa (yeni dönem, kontenjan artışı, kayıt iptali) bekleyenlere e-posta + uygulama içi bildirim gönderir.
 * Kurs yayında ve kapalı değilse çalışır; haber verilenler notifiedAt ile işaretlenir (tekrar gönderilmez).
 * saveCourse, unenrollUser ve kapalı→açık geçişinden çağrılır; tekrarlı çağrı güvenlidir.
 */
export async function notifyWaitlistIfOpen(courseId: number): Promise<number> {
  const [c] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c || c.status !== "published" || c.closed) return 0;
  const free = await availablePeriods(courseId);
  if (free.length === 0) return 0;
  const waiting = await db
    .select()
    .from(periodWaitlist)
    .where(and(eq(periodWaitlist.courseId, courseId), isNull(periodWaitlist.notifiedAt)));
  if (waiting.length === 0) return 0;

  const url = siteUrl(`/program/${c.slug}`);
  const isMeeting = c.type === "meeting";
  const list = free
    .slice(0, 6)
    .map((p) => `<li><b>${p.name}</b> · ${isMeeting ? p.startDate : fmtRange(p.startDate, p.endDate)} · ${p.capacity - p.enrolled} kişilik yer</li>`)
    .join("");
  const html = emailTemplate({
    title: isMeeting ? "Yeni görüşme saati açıldı" : "Kontenjan açıldı!",
    html: `<p><b>${c.title}</b> için ${isMeeting ? "yeni görüşme saatleri" : "kayıt açık ve boş yeri olan dönemler"} var. Yer sınırlı; kaydını hemen tamamlayabilirsin.</p><ul>${list}</ul><p style="color:#64748b;font-size:13px">Bu e-postayı "tekrar açılınca haber ver" dediğin için aldın.</p>`,
    buttonText: "Hemen kayıt ol",
    buttonUrl: url,
  });

  let sent = 0;
  for (const w of waiting) {
    await sendMail({ type: "waitlist", to: w.email, subject: `${c.title}: ${isMeeting ? "yeni görüşme saati açıldı" : "kontenjan açıldı"}`, html });
    if (w.userId) {
      await notifyUser(w.userId, {
        title: isMeeting ? "Yeni görüşme saati açıldı" : "Kontenjan açıldı",
        body: `${c.title} · ${free[0].name}`,
        url: `/program/${c.slug}`,
        tag: `wait-${c.id}`,
      });
    }
    await db.update(periodWaitlist).set({ notifiedAt: new Date() }).where(eq(periodWaitlist.id, w.id));
    sent++;
  }
  return sent;
}
