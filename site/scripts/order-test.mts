// Sipariş–kayıt tutarlılığı testi: dönem değiştirme ve eğitimden çıkarma siparişi/kaydı bozmamalı.
// Geçici kullanıcı, eğitim, dönem ve sipariş oluşturur; sonunda siler. E-posta tetiklemez (karşılama kapalı, bekleme listesi boş).
// Çalıştır: npx tsx --conditions=react-server scripts/order-test.mts
import "dotenv/config";
import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "../db";
import { users, courses, periods, periodEnrollments, enrollments, orders } from "../db/schema";
import { enrollUser, unenrollUser, moveEnrollmentPeriod } from "../lib/enroll";

let fails = 0;
const check = (name: string, ok: boolean, extra = "") => { console.log(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`); if (!ok) fails++; };
const stamp = Date.now().toString(36);
const TAG = `__siparis_test_${stamp}`;
const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const ids = { users: [] as number[], courses: [] as number[], orders: [] as number[] };
const mkUser = async (n: string) => { const [u] = await db.insert(users).values({ email: `siparis-test-${n}-${stamp}@example.invalid`, firstName: "Sipariş", lastName: n, passwordHash: "x", role: "student" }).returning(); ids.users.push(u.id); return u; };
const mkCourse = async (n: string, group: "takvimli" | "esnek") => { const [c] = await db.insert(courses).values({ title: `${TAG}_${n}`, slug: `${TAG}-${n}`.toLowerCase(), status: "draft", price: "500", group }).returning(); ids.courses.push(c.id); return c; };
const mkOrder = async (userId: number, items: { courseId: number; title: string; price: number; periodId: number | null; periodName: string | null }[]) => {
  const total = items.reduce((s, i) => s + i.price, 0).toFixed(2);
  const [o] = await db.insert(orders).values({ userId, status: "paid", items, subtotal: total, discount: "0", total, provider: "manual", paidAt: new Date() }).returning();
  ids.orders.push(o.id);
  return o;
};
const orderOf = async (id: number) => (await db.select().from(orders).where(eq(orders.id, id)).limit(1))[0];
const enrOf = async (userId: number, courseId: number) => (await db.select().from(enrollments).where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))).limit(1))[0];
const periodsOf = async (userId: number, courseId: number) => (await db.select({ id: periodEnrollments.periodId }).from(periodEnrollments).innerJoin(periods, eq(periodEnrollments.periodId, periods.id)).where(and(eq(periodEnrollments.userId, userId), eq(periods.courseId, courseId)))).map((r) => r.id);

try {
  const u = await mkUser("a");
  const other = await mkUser("b");
  const A = await mkCourse("takvimli", "takvimli");
  const B = await mkCourse("esnek", "esnek");
  const C = await mkCourse("tek", "esnek");
  const [p1] = await db.insert(periods).values({ courseId: A.id, name: "Dönem 1", startDate: day(10), endDate: day(20), capacity: 1 }).returning();
  const [p2] = await db.insert(periods).values({ courseId: A.id, name: "Dönem 2", startDate: day(30), endDate: day(40), capacity: 1 }).returning();
  const [px] = await db.insert(periods).values({ courseId: B.id, name: "Başka kursun dönemi", startDate: day(10), endDate: day(20), capacity: 5 }).returning();

  // ---- Çok kalemli ödenmiş sipariş: A (Dönem 1) + B
  const o = await mkOrder(u.id, [
    { courseId: A.id, title: A.title, price: 500, periodId: p1.id, periodName: p1.name },
    { courseId: B.id, title: B.title, price: 500, periodId: null, periodName: null },
  ]);
  await enrollUser({ userId: u.id, courseId: A.id, orderId: o.id, periodId: p1.id, sendWelcome: false });
  await enrollUser({ userId: u.id, courseId: B.id, orderId: o.id, sendWelcome: false });
  const started = new Date("2026-09-01T10:00:00Z");
  await db.update(enrollments).set({ startedAt: started }).where(and(eq(enrollments.userId, u.id), eq(enrollments.courseId, A.id)));
  const before = await enrOf(u.id, A.id);

  // ---- K2: dönem değiştirme
  const m = await moveEnrollmentPeriod({ userId: u.id, courseId: A.id, periodId: p2.id, orderId: o.id });
  const after = await enrOf(u.id, A.id);
  check("dönem değişimi: işlem başarılı", m.ok && !m.overCapacity);
  check("dönem değişimi: sipariş ödenmiş kaldı", (await orderOf(o.id)).status === "paid");
  check("dönem değişimi: kurs kaydı aynı (silinip yeniden açılmadı)", after?.id === before.id);
  check("dönem değişimi: başlangıç ve kayıt tarihi korundu", after?.startedAt?.getTime() === started.getTime() && after?.enrolledAt.getTime() === before.enrolledAt.getTime());
  check("dönem değişimi: yalnızca yeni döneme kayıtlı", JSON.stringify(await periodsOf(u.id, A.id)) === JSON.stringify([p2.id]));
  const bad = await moveEnrollmentPeriod({ userId: u.id, courseId: A.id, periodId: px.id });
  check("dönem değişimi: başka kursun dönemi reddedildi", !bad.ok && JSON.stringify(await periodsOf(u.id, A.id)) === JSON.stringify([p2.id]));
  await enrollUser({ userId: other.id, courseId: A.id, periodId: p1.id, sendWelcome: false });
  const full = await moveEnrollmentPeriod({ userId: u.id, courseId: A.id, periodId: p1.id, orderId: o.id });
  check("dönem değişimi: dolu döneme taşıyınca kontenjan uyarısı", full.ok && full.overCapacity && full.enrolled === 2 && full.capacity === 1);
  const none = await moveEnrollmentPeriod({ userId: u.id, courseId: A.id, periodId: null });
  check("dönem değişimi: 'dönem seçilmedi' dönem kaydını kaldırır, kurs kaydı kalır", none.ok && (await periodsOf(u.id, A.id)).length === 0 && !!(await enrOf(u.id, A.id)));
  check("dönem değişimi: tüm adımlardan sonra sipariş hâlâ ödenmiş", (await orderOf(o.id)).status === "paid");

  // ---- K3: çok kalemli siparişte tek eğitimden çıkarma
  const r1 = await unenrollUser(u.id, B.id);
  let ord = await orderOf(o.id);
  check("çıkarma (çok kalemli): sipariş ödenmiş kaldı", r1.removed && r1.order === "kept" && r1.orderId === o.id && ord.status === "paid");
  check("çıkarma (çok kalemli): sipariş notuna yazıldı", ord.note.includes(B.title) && ord.note.includes("kaydı kaldırıldı"), ord.note);
  check("çıkarma (çok kalemli): diğer eğitimin kaydı duruyor", !!(await enrOf(u.id, A.id)) && !(await enrOf(u.id, B.id)));
  const r2 = await unenrollUser(u.id, A.id);
  ord = await orderOf(o.id);
  check("çıkarma: siparişteki son eğitim de çıkınca sipariş iptal", r2.order === "cancelled" && ord.status === "cancelled");
  const r3 = await unenrollUser(u.id, A.id);
  check("çıkarma: kayıt yokken ikinci çağrı zararsız", !r3.removed && r3.order === "none");

  // ---- Tek kalemli sipariş
  const o2 = await mkOrder(u.id, [{ courseId: C.id, title: C.title, price: 500, periodId: null, periodName: null }]);
  await enrollUser({ userId: u.id, courseId: C.id, orderId: o2.id, sendWelcome: false });
  const r4 = await unenrollUser(u.id, C.id);
  check("çıkarma (tek kalemli): sipariş iptal", r4.order === "cancelled" && (await orderOf(o2.id)).status === "cancelled");

  // ---- Siparişsiz (elle/ücretsiz) kayıt
  await enrollUser({ userId: u.id, courseId: C.id, sendWelcome: false });
  const r5 = await unenrollUser(u.id, C.id);
  check("çıkarma (siparişsiz kayıt): siparişlere dokunulmadı", r5.removed && r5.order === "none" && r5.orderId === null);

  // ---- İade edilmiş sipariş: durum 'iade' kalır
  const o3 = await mkOrder(u.id, [{ courseId: C.id, title: C.title, price: 500, periodId: null, periodName: null }]);
  await enrollUser({ userId: u.id, courseId: C.id, orderId: o3.id, sendWelcome: false });
  await db.update(orders).set({ status: "refunded" }).where(eq(orders.id, o3.id));
  await unenrollUser(u.id, C.id);
  check("iade: kayıt kalkınca sipariş 'iade' kalır (iptale dönmez)", (await orderOf(o3.id)).status === "refunded");
} finally {
  if (ids.orders.length) await db.delete(orders).where(inArray(orders.id, ids.orders));
  if (ids.courses.length) await db.delete(courses).where(inArray(courses.id, ids.courses));
  await db.delete(courses).where(like(courses.title, "__siparis_test_%"));
  if (ids.users.length) await db.delete(users).where(inArray(users.id, ids.users));
}
console.log(fails ? `\n${fails} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
process.exit(fails ? 1 : 0);
