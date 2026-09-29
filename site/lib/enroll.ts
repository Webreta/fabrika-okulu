import "server-only";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { enrollments, periodEnrollments, periods, courses, users, orders, coupons } from "@/db/schema";
import { sendMail, emailTemplate, siteUrl, adminEmails, escapeHtml } from "@/lib/mailer";
import { notifyUser, notifyUsers } from "@/lib/notify";
import { notifyWaitlistIfOpen } from "@/lib/waitlist";
import { fmtMoney } from "@/lib/format";
import { openPeriods, getCoursePeriods } from "@/lib/data/courses";
import { isPreorder } from "@/lib/course-logic";
import { fmtDay, todayISO } from "@/lib/format";

export type EnrollResult = { ok: true; overCapacity: boolean } | { ok: false; reason: "full" };

/**
 * Öğrenciyi kursa (ve varsa döneme) kaydeder. Tekrarlı çağrı güvenlidir.
 * Dönem kaydı satır kilidiyle yapılır: aynı anda gelen iki kayıt son koltuğu birlikte alamaz.
 * strictCapacity: dönem doluysa hiç kaydetmez ({ ok: false, reason: "full" }); ücretsiz kayıtta kullanılır.
 * Ödenmiş siparişte (strict değil) dönem dolu olsa da kaydeder, yöneticiye "Kontenjan aşıldı" bildirir.
 */
export async function enrollUser(opts: {
  userId: number;
  courseId: number;
  orderId?: number | null;
  periodId?: number | null;
  sendWelcome?: boolean;
  strictCapacity?: boolean;
}): Promise<EnrollResult> {
  let periodId = opts.periodId ?? null;
  if (!periodId) {
    // Dönem seçilmemişse kayıt açık ve dolu olmayan en yakın dönem
    const list = openPeriods(await getCoursePeriods(opts.courseId));
    const free = list.find((p) => p.enrolled < p.capacity);
    if (free) periodId = free.id;
  }

  const tx = await db.transaction(async (t) => {
    let over: { periodId: number; enrolled: number; capacity: number } | null = null;
    if (periodId) {
      const locked = await t.execute(sql`select id, capacity from periods where id = ${periodId} and course_id = ${opts.courseId} for update`);
      const p = locked[0] as { id: number; capacity: number } | undefined;
      if (p) {
        const [mine] = await t.select({ id: periodEnrollments.id }).from(periodEnrollments).where(and(eq(periodEnrollments.periodId, p.id), eq(periodEnrollments.userId, opts.userId))).limit(1);
        if (!mine) {
          const [{ n }] = await t.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(periodEnrollments).where(eq(periodEnrollments.periodId, p.id));
          if (n >= Number(p.capacity)) {
            if (opts.strictCapacity) return { full: true as const, over };
            over = { periodId: p.id, enrolled: n + 1, capacity: Number(p.capacity) };
          }
          await t.insert(periodEnrollments).values({ periodId: p.id, userId: opts.userId, orderId: opts.orderId ?? null });
        }
      }
    }
    const [existing] = await t.select().from(enrollments).where(and(eq(enrollments.userId, opts.userId), eq(enrollments.courseId, opts.courseId))).limit(1);
    if (existing) {
      if (existing.status !== "active") await t.update(enrollments).set({ status: "active" }).where(eq(enrollments.id, existing.id));
    } else {
      await t.insert(enrollments).values({ userId: opts.userId, courseId: opts.courseId, orderId: opts.orderId ?? 0, status: "active" }).onConflictDoNothing();
    }
    return { full: false as const, over };
  });
  if (tx.full) return { ok: false, reason: "full" };

  // Ödeme sepet-ödeme arasında dolan döneme denk geldiyse öğrenci yine kaydedilir (parası alındı); yöneticiye haber ver
  if (tx.over) {
    const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
    const [c] = await db.select({ title: courses.title }).from(courses).where(eq(courses.id, opts.courseId)).limit(1);
    await notifyUsers(admins.map((a) => a.id), {
      title: "Kontenjan aşıldı",
      body: `${c?.title ?? "Kurs"} · dönem #${tx.over.periodId}: ${tx.over.enrolled}/${tx.over.capacity} kayıt. Kontenjanı artırmak ya da öğrenciyi başka döneme almak gerekebilir.`,
      url: `/egitmen/detay/${opts.courseId}`,
    });
  }

  if (opts.sendWelcome !== false) {
    const [[u], [c]] = await Promise.all([
      db.select().from(users).where(eq(users.id, opts.userId)).limit(1),
      db.select().from(courses).where(eq(courses.id, opts.courseId)).limit(1),
    ]);
    if (u && c && isPreorder(c)) {
      // Erken kayıt: eğitim henüz açılmadı; açılış tarihi bildirilir, açılınca ayrıca haber verilir (lib/preorder.ts)
      const day = fmtDay(c.opensAt, true);
      await sendMail({
        type: "welcome",
        to: u.email,
        subject: `${c.title}: erken kaydın alındı`,
        html: emailTemplate({
          title: "Erken kaydın alındı!",
          html: `<p><b>${escapeHtml(c.title)}</b> eğitimine erken kaydın tamamlandı. Eğitim <b>${day}</b> tarihinde aktifleşecek; o güne kadar Kitaplığında seni bekliyor olacak.</p><p>Eğitim açıldığında sana ayrıca haber vereceğiz.</p>`,
          buttonText: "Kitaplığıma git",
          buttonUrl: siteUrl("/panel/egitim"),
        }),
      });
      await notifyUser(u.id, { title: "Erken kaydın alındı", body: `${c.title} · ${day} tarihinde aktifleşecek`, url: "/panel/egitim", tag: `enroll-${c.id}` });
    } else if (u && c) {
      await sendMail({
        type: "welcome",
        to: u.email,
        subject: `${c.title} programına kaydın tamamlandı`,
        html: emailTemplate({
          title: "Programa hoş geldin!",
          html: `<p><b>${escapeHtml(c.title)}</b> programına kaydın tamamlandı. Çalışma Odan'dan hemen başlayabilirsin.</p>`,
          buttonText: "Programa başla",
          buttonUrl: siteUrl(`/kurs-izle/${c.id}`),
        }),
      });
      await notifyUser(u.id, {
        title: "Programa kaydın tamamlandı",
        body: c.title,
        url: `/kurs-izle/${c.id}`,
        tag: `enroll-${c.id}`,
      });
    }
  }
  return { ok: true, overCapacity: !!tx.over };
}

export type UnenrollResult = {
  removed: boolean;
  /** Kaydın bağlı olduğu sipariş (yoksa null) */
  orderId: number | null;
  /** cancelled: siparişte başka eğitim kalmadığı için iptal edildi · kept: siparişteki diğer eğitim(ler) sürdüğü için ödenmiş kaldı */
  order: "cancelled" | "kept" | "none";
};

/**
 * Öğrenciyi eğitimden çıkarır (kayıt + dönem kayıtları silinir).
 * Sipariş kuralı: ödenmiş sipariş yalnızca içindeki TÜM eğitimlerin kaydı kalktığında "İptal" olur.
 * Çok kalemli siparişte tek eğitim çıkarılırsa sipariş ödenmiş kalır, sipariş notuna düşülür
 * (aksi hâlde "sipariş iptal ama öğrenci diğer eğitime kayıtlı" tutarsızlığı ve eksik ciro oluşuyordu).
 */
export async function unenrollUser(userId: number, courseId: number): Promise<UnenrollResult> {
  const [e] = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)))
    .limit(1);
  if (!e) return { removed: false, orderId: null, order: "none" };
  await db.delete(enrollments).where(eq(enrollments.id, e.id));
  // Dönem kayıtlarını da kaldır
  const ps = await db.select({ id: periods.id }).from(periods).where(eq(periods.courseId, courseId));
  for (const p of ps) {
    await db.delete(periodEnrollments).where(and(eq(periodEnrollments.periodId, p.id), eq(periodEnrollments.userId, userId)));
  }
  let order: UnenrollResult["order"] = "none";
  if (e.orderId && e.orderId > 0) {
    const [o] = await db.select().from(orders).where(eq(orders.id, e.orderId)).limit(1);
    if (o && o.status === "paid") {
      // Siparişteki diğer eğitimlerden kaydı süren var mı?
      const otherIds = o.items.map((i) => i.courseId).filter((id) => id !== courseId);
      const still = otherIds.length
        ? await db
            .select({ courseId: enrollments.courseId })
            .from(enrollments)
            .where(and(eq(enrollments.userId, userId), eq(enrollments.status, "active"), inArray(enrollments.courseId, otherIds)))
        : [];
      if (still.length > 0) {
        const title = o.items.find((i) => i.courseId === courseId)?.title ?? `Eğitim #${courseId}`;
        const line = `${fmtDay(todayISO())}: "${title}" kaydı kaldırıldı (sipariş ödenmiş kaldı).`;
        await db.update(orders).set({ note: o.note ? `${o.note}\n${line}` : line }).where(eq(orders.id, o.id));
        order = "kept";
      } else {
        await db.update(orders).set({ status: "cancelled" }).where(and(eq(orders.id, o.id), eq(orders.status, "paid")));
        order = "cancelled";
      }
    }
  }
  // Koltuk boşaldı: bekleme listesine haber ver
  await notifyWaitlistIfOpen(courseId);
  return { removed: true, orderId: e.orderId && e.orderId > 0 ? e.orderId : null, order };
}

/**
 * Kayıtlı öğrencinin dönemini değiştirir: yalnızca dönem kaydı taşınır.
 * Kurs kaydına (enrolledAt, startedAt, ilerleme) ve siparişin durumuna dokunulmaz.
 * Yönetici işlemidir: hedef dönem doluysa da taşır, `overCapacity` ile bildirir. periodId null → dönemsiz bırakır.
 */
export async function moveEnrollmentPeriod(opts: { userId: number; courseId: number; periodId: number | null; orderId?: number | null }): Promise<{ ok: true; overCapacity: boolean; enrolled: number; capacity: number } | { ok: false; error: string }> {
  const coursePeriods = await db.select({ id: periods.id, capacity: periods.capacity }).from(periods).where(eq(periods.courseId, opts.courseId));
  const target = opts.periodId ? coursePeriods.find((p) => p.id === opts.periodId) : null;
  if (opts.periodId && !target) return { ok: false, error: "Dönem bu eğitime ait değil." };
  // Eski dönem kayıtları (hedef dışındakiler) kaldırılır
  for (const p of coursePeriods) {
    if (p.id === opts.periodId) continue;
    await db.delete(periodEnrollments).where(and(eq(periodEnrollments.periodId, p.id), eq(periodEnrollments.userId, opts.userId)));
  }
  let enrolled = 0;
  if (target) {
    await db.insert(periodEnrollments).values({ periodId: target.id, userId: opts.userId, orderId: opts.orderId ?? null }).onConflictDoNothing();
    const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(periodEnrollments).where(eq(periodEnrollments.periodId, target.id));
    enrolled = n;
  }
  // Eski dönemde yer açıldıysa bekleyenlere haber ver
  await notifyWaitlistIfOpen(opts.courseId);
  return { ok: true, overCapacity: !!target && enrolled > target.capacity, enrolled, capacity: target?.capacity ?? 0 };
}

/**
 * Sipariş ödendi → tüm kalemleri kaydet, kuponu kullanılmış işaretle, mail at.
 * Tekrar çağrıya dayanıklıdır: işi yalnızca `fulfilledAt` alanını ilk dolduran çağrı yapar
 * (çift ödeme dönüşü, yöneticinin iki kez "Ödendi" demesi, dönüş + yönetici onayı yarışı).
 * Sonraki çağrılar e-posta göndermez, kuponu yeniden saymaz; yalnızca eksik kayıt varsa sessizce tamamlar.
 * İade edilmiş sipariş bu yolla yeniden ödenmiş yapılamaz.
 */
export async function fulfillOrder(orderId: number, payment?: { paymentId?: string | null; token?: string | null }): Promise<{ ok: boolean; first: boolean }> {
  const claimed = await db
    .update(orders)
    .set({
      status: "paid",
      paidAt: sql`coalesce(${orders.paidAt}, now())`,
      fulfilledAt: new Date(),
      ...(payment?.paymentId ? { providerPaymentId: payment.paymentId } : {}),
      ...(payment?.token ? { providerToken: payment.token } : {}),
    })
    .where(and(eq(orders.id, orderId), isNull(orders.fulfilledAt), ne(orders.status, "refunded")))
    .returning();
  const o = claimed[0];
  if (!o) {
    const [ex] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!ex || ex.status !== "paid") return { ok: false, first: false };
    for (const item of ex.items) await enrollUser({ userId: ex.userId, courseId: item.courseId, orderId: ex.id, periodId: item.periodId ?? null, sendWelcome: false });
    return { ok: true, first: false };
  }
  for (const item of o.items) {
    await enrollUser({ userId: o.userId, courseId: item.courseId, orderId: o.id, periodId: item.periodId ?? null });
  }
  // Kupon normalde sipariş oluşurken ayrılır (lib/orders.ts); ayrılmamışsa (eski sipariş, yeniden onaylanan iptal) burada sayılır
  if (o.couponCode && !o.couponReserved) {
    await db.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.code, o.couponCode));
    await db.update(orders).set({ couponReserved: true }).where(eq(orders.id, o.id));
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
        html: `<p><b>${escapeHtml(`${u?.firstName ?? ""} ${u?.lastName ?? ""}`.trim())}</b> (${escapeHtml(u?.email)})</p><ul>${o.items
          .map((i) => `<li>${escapeHtml(i.title)}${i.periodName ? ` — ${escapeHtml(i.periodName)}` : ""} · ${fmtMoney(i.price)}</li>`)
          .join("")}</ul><p>Toplam: <b>${fmtMoney(o.total)}</b> (${escapeHtml(o.provider)})</p>`,
        buttonText: "Siparişi gör",
        buttonUrl: siteUrl(`/admin/siparisler/${o.id}`),
      }),
    });
  }
  return { ok: true, first: true };
}
