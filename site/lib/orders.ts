import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { coupons, orders } from "@/db/schema";
import { notifyUser } from "@/lib/notify";

// Sipariş yardımcıları: kupon ayırma/bırakma ve bekleyen siparişlerin ömrü.

/** Bekleyen havale siparişi bu kadar gün içinde ödenmezse otomatik iptal edilir; bu süre boyunca koltuğu da tutar */
export const PENDING_ORDER_DAYS = 7;
/** Yarıda bırakılmış kartlı ödeme siparişi koltuğu bu kadar dakika tutar */
export const CARD_HOLD_MINUTES = 30;

/**
 * Dönemde bekleyen siparişlerin tuttuğu koltuk sayısı ("periods" tablosu sorgudayken alt sorgu olarak kullanılır).
 * Sayılanlar: süresi dolmamış bekleyen havale siparişleri, son dakikalarda başlatılmış kartlı ödemeler ve
 * ödenmiş ama kaydı henüz işlenmemiş siparişler. Öğrenci döneme zaten kayıtlıysa sayılmaz.
 * excludeUserId: öğrencinin kendi bekleyen siparişi kendisini engellemesin.
 */
export function heldSeatsSql(excludeUserId?: number | null) {
  return sql<number>`(select count(*) from orders o where (
      (o.status = 'pending' and o.provider = 'manual' and o.created_at > now() - make_interval(days => ${PENDING_ORDER_DAYS}))
      or (o.status = 'pending' and o.provider = 'iyzico' and o.created_at > now() - make_interval(mins => ${CARD_HOLD_MINUTES}))
      or (o.status = 'paid' and o.fulfilled_at is null))
    and exists (select 1 from jsonb_array_elements(o.items) it where it->>'periodId' = "periods"."id"::text)
    and not exists (select 1 from period_enrollments pe where pe.period_id = "periods"."id" and pe.user_id = o.user_id)
    ${excludeUserId ? sql`and o.user_id <> ${excludeUserId}` : sql``})`;
}

/**
 * Kupon kullanımını ayırır (sayaç +1). Limit doluysa false döner ve hiçbir şey değişmez.
 * Tek SQL ifadesi olduğu için aynı anda gelen iki sipariş tek kullanımlık kuponu birlikte alamaz.
 */
export async function reserveCoupon(code: string): Promise<boolean> {
  const r = await db
    .update(coupons)
    .set({ usedCount: sql`${coupons.usedCount} + 1` })
    .where(and(eq(coupons.code, code), sql`(${coupons.usageLimit} <= 0 or ${coupons.usedCount} < ${coupons.usageLimit})`))
    .returning({ id: coupons.id });
  return r.length > 0;
}

/** Sipariş oluşturulamadıysa ayrılan kupon kullanımını geri bırakır (sipariş satırı yokken) */
export async function unreserveCoupon(code: string) {
  await db.update(coupons).set({ usedCount: sql`greatest(${coupons.usedCount} - 1, 0)` }).where(eq(coupons.code, code));
}

/** Öğrencinin, bu eğitimlerden birini içeren bekleyen siparişlerinde bu kupon için ayırdığı kullanım sayısı (yeni sipariş onların yerine geçeceği için limit hesabından düşülür) */
export async function ownPendingReservations(userId: number, code: string, courseIds: number[]) {
  const rows = await db.select({ items: orders.items }).from(orders).where(and(eq(orders.userId, userId), eq(orders.status, "pending"), eq(orders.couponReserved, true), eq(orders.couponCode, code)));
  return rows.filter((o) => o.items.some((i) => courseIds.includes(i.courseId))).length;
}

/** Siparişin ayırdığı kupon kullanımını geri bırakır (iptal, iade, başarısız ödeme, süre aşımı). Tekrarlı çağrı güvenlidir. */
export async function releaseOrderCoupon(orderId: number) {
  const claimed = await db
    .update(orders)
    .set({ couponReserved: false })
    .where(and(eq(orders.id, orderId), eq(orders.couponReserved, true)))
    .returning({ code: orders.couponCode });
  const code = claimed[0]?.code;
  if (!code) return false;
  await db.update(coupons).set({ usedCount: sql`greatest(${coupons.usedCount} - 1, 0)` }).where(eq(coupons.code, code));
  return true;
}

/** Bekleyen siparişi iptal eder (not düşer, kuponu bırakır). Yalnızca `pending` durumundaki siparişe uygulanır. */
export async function cancelPendingOrder(orderId: number, note: string) {
  const r = await db
    .update(orders)
    .set({ status: "cancelled", note: sql`case when ${orders.note} = '' then ${note} else ${orders.note} || E'\\n' || ${note} end` })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending")))
    .returning({ id: orders.id, userId: orders.userId });
  if (r.length === 0) return false;
  await releaseOrderCoupon(orderId);
  return true;
}

/** Aynı öğrencinin, verilen eğitimlerden birini içeren eski bekleyen siparişleri iptal edilir (yeni sipariş onların yerine geçer) */
export async function supersedePendingOrders(userId: number, courseIds: number[], newOrderHint = "yeni sipariş") {
  if (courseIds.length === 0) return 0;
  const rows = await db.select({ id: orders.id, items: orders.items }).from(orders).where(and(eq(orders.userId, userId), eq(orders.status, "pending")));
  let n = 0;
  for (const o of rows) {
    if (!o.items.some((i) => courseIds.includes(i.courseId))) continue;
    if (await cancelPendingOrder(o.id, `Aynı eğitim için ${newOrderHint} oluşturulduğundan iptal edildi.`)) n++;
  }
  return n;
}

/** Yarım bırakılan kartlı ödeme siparişi bu kadar saat sonra iptal edilir (ayrılan kupon geri bırakılır) */
export const CARD_EXPIRE_HOURS = 24;

/**
 * Cron: süresi dolan bekleyen havale siparişleri iptal edilir, öğrenciye bildirilir.
 * Yarım bırakılan kartlı ödemeler de sessizce iptal edilir; koltuğu 30 dk sonra bırakmışlardı ama kuponu tutuyorlardı.
 */
export async function expirePendingOrders(): Promise<number> {
  const abandoned = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.status, "pending"), eq(orders.provider, "iyzico"), lt(orders.createdAt, sql`now() - make_interval(hours => ${CARD_EXPIRE_HOURS})`)));
  for (const o of abandoned) await cancelPendingOrder(o.id, "Kartlı ödeme tamamlanmadığı için otomatik iptal edildi.");

  const old = await db
    .select({ id: orders.id, userId: orders.userId })
    .from(orders)
    .where(and(eq(orders.status, "pending"), inArray(orders.provider, ["manual"]), lt(orders.createdAt, sql`now() - make_interval(days => ${PENDING_ORDER_DAYS})`)));
  let n = 0;
  for (const o of old) {
    if (!(await cancelPendingOrder(o.id, `${PENDING_ORDER_DAYS} gün içinde ödeme alınmadığı için otomatik iptal edildi.`))) continue;
    await notifyUser(o.userId, { title: "Siparişin iptal edildi", body: `Sipariş #${o.id} için ${PENDING_ORDER_DAYS} gün içinde ödeme alınamadı. Dilersen yeniden sipariş verebilirsin.`, url: "/panel/siparis", tag: `order-${o.id}` });
    n++;
  }
  return n;
}
