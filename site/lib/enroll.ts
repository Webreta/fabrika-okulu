import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { enrollments, periodEnrollments, periods, courses, users, orders, coupons } from "@/db/schema";
import { sendMail, emailTemplate, siteUrl, adminEmails } from "@/lib/mailer";
import { notifyUser } from "@/lib/notify";
import { fmtMoney } from "@/lib/format";
import { openPeriods, getCoursePeriods } from "@/lib/data/courses";

/** Öğrenciyi kursa (ve varsa döneme) kaydeder. Tekrarlı çağrı güvenlidir. */
export async function enrollUser(opts: {
  userId: number;
  courseId: number;
  orderId?: number | null;
  periodId?: number | null;
  sendWelcome?: boolean;
}) {
  const existing = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.userId, opts.userId), eq(enrollments.courseId, opts.courseId)))
    .limit(1);
  if (existing[0]) {
    if (existing[0].status !== "active") {
      await db.update(enrollments).set({ status: "active" }).where(eq(enrollments.id, existing[0].id));
    }
  } else {
    await db.insert(enrollments).values({
      userId: opts.userId,
      courseId: opts.courseId,
      orderId: opts.orderId ?? 0,
      status: "active",
    });
  }

  // Dönem kaydı
  let periodId = opts.periodId ?? null;
  if (!periodId) {
    // Dönem seçilmemişse kayıt açık ve dolu olmayan en yakın dönem
    const list = openPeriods(await getCoursePeriods(opts.courseId));
    const free = list.find((p) => p.enrolled < p.capacity);
    if (free) periodId = free.id;
  }
  if (periodId) {
    const [p] = await db
      .select({
        id: periods.id,
        capacity: periods.capacity,
        enrolled: sql<number>`(select count(*) from ${periodEnrollments} pe where pe.period_id = ${periods.id})`.mapWith(Number),
      })
      .from(periods)
      .where(and(eq(periods.id, periodId), eq(periods.courseId, opts.courseId)))
      .limit(1);
    if (p) {
      const already = await db
        .select({ id: periodEnrollments.id })
        .from(periodEnrollments)
        .where(and(eq(periodEnrollments.periodId, p.id), eq(periodEnrollments.userId, opts.userId)))
        .limit(1);
      if (!already[0]) {
        await db.insert(periodEnrollments).values({ periodId: p.id, userId: opts.userId, orderId: opts.orderId ?? null });
      }
    }
  }

  if (opts.sendWelcome !== false) {
    const [[u], [c]] = await Promise.all([
      db.select().from(users).where(eq(users.id, opts.userId)).limit(1),
      db.select().from(courses).where(eq(courses.id, opts.courseId)).limit(1),
    ]);
    if (u && c) {
      await sendMail({
        type: "welcome",
        to: u.email,
        subject: `${c.title} programına kaydın tamamlandı`,
        html: emailTemplate({
          title: "Programa hoş geldin!",
          html: `<p><b>${c.title}</b> programına kaydın tamamlandı. Çalışma Odan'dan hemen başlayabilirsin.</p>`,
          buttonText: "Programa başla",
          buttonUrl: siteUrl(`/kurs-izle/${c.id}`),
        }),
      });
      await notifyUser(u.id, {
        title: "🎉 Programa kaydın tamamlandı",
        body: c.title,
        url: `/kurs-izle/${c.id}`,
        tag: `enroll-${c.id}`,
      });
    }
  }
}

export async function unenrollUser(userId: number, courseId: number) {
  const [e] = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)))
    .limit(1);
  if (!e) return;
  await db.delete(enrollments).where(eq(enrollments.id, e.id));
  // Dönem kayıtlarını da kaldır
  const ps = await db.select({ id: periods.id }).from(periods).where(eq(periods.courseId, courseId));
  for (const p of ps) {
    await db.delete(periodEnrollments).where(and(eq(periodEnrollments.periodId, p.id), eq(periodEnrollments.userId, userId)));
  }
  if (e.orderId && e.orderId > 0) {
    await db.update(orders).set({ status: "cancelled" }).where(and(eq(orders.id, e.orderId), eq(orders.status, "paid")));
  }
}

/** Sipariş ödendi → tüm kalemleri kaydet, kuponu kullanılmış işaretle, mail at */
export async function fulfillOrder(orderId: number) {
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o) return;
  if (o.status !== "paid") {
    await db.update(orders).set({ status: "paid", paidAt: new Date() }).where(eq(orders.id, orderId));
  }
  for (const item of o.items) {
    await enrollUser({ userId: o.userId, courseId: item.courseId, orderId: o.id, periodId: item.periodId ?? null });
  }
  if (o.couponCode) {
    await db
      .update(coupons)
      .set({ usedCount: sql`${coupons.usedCount} + 1` })
      .where(eq(coupons.code, o.couponCode));
  }
  const [u] = await db.select().from(users).where(eq(users.id, o.userId)).limit(1);
  const admins = await adminEmails();
  if (admins.length) {
    await sendMail({
      type: "order_paid",
      to: admins,
      subject: `Yeni sipariş #${o.id} — ${fmtMoney(o.total)}`,
      html: emailTemplate({
        title: `Yeni sipariş #${o.id}`,
        html: `<p><b>${u?.firstName} ${u?.lastName}</b> (${u?.email})</p><ul>${o.items
          .map((i) => `<li>${i.title}${i.periodName ? ` — ${i.periodName}` : ""} · ${fmtMoney(i.price)}</li>`)
          .join("")}</ul><p>Toplam: <b>${fmtMoney(o.total)}</b> (${o.provider})</p>`,
        buttonText: "Siparişi gör",
        buttonUrl: siteUrl(`/admin/siparisler/${o.id}`),
      }),
    });
  }
}
