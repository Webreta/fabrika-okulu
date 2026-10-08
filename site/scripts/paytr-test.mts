// PayTR testi: imza hesapları, sipariş numarası, bildirim ucu (başarılı / başarısız / sahte imza / tutar uyuşmazlığı / tekrar).
// Geçici kullanıcı + sipariş oluşturur, sonunda siler. PayTR'ye istek atmaz; e-posta gitmez (sipariş e-postası kullanıcı tercihine bağlı değil
// ama test kullanıcısının adresi example.invalid olduğu için SMTP reddeder).
// Çalıştır: npx tsx --conditions=react-server scripts/paytr-test.mts
import "dotenv/config";
process.env.PAYTR_MERCHANT_ID = "123456";
process.env.PAYTR_MERCHANT_KEY = "testkey";
process.env.PAYTR_MERCHANT_SALT = "testsalt";
process.env.PAYTR_TEST_MODE = "1";
import { createHmac } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, orders, courses, enrollments } from "../db/schema";
import { tokenHash, callbackHash, newMerchantOid, orderIdFromMerchantOid, toKurus, paytrEnabled, verifyNotification } from "../lib/paytr";
import { resolvePaymentMode } from "../lib/payment";
import { POST } from "../app/api/odeme/paytr/route";

let fails = 0;
const check = (name: string, ok: boolean, extra = "") => { console.log(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`); if (!ok) fails++; };

// ---- 1) Saf kurallar
// Panelde PayTR bilgisi kayıtlıysa o öncelikli; bu testte ortam değişkenleri geçerli olsun diye geçici olarak boşaltılır
import { getSetting, setSetting } from "../lib/settings";
const paymentBefore = await getSetting("payment");
await setSetting("payment", { paytrMerchantId: "", paytrKey: "", paytrSalt: "" });
check("anahtarlar tanımlıysa etkin (ortam değişkeni)", await paytrEnabled());
check("kuruş dönüşümü", toKurus(100.5) === 10050 && toKurus(1250) === 125000 && toKurus(0.1 + 0.2) === 30);
const oid = newMerchantOid(42);
check("sipariş no yalnızca harf/rakam ve geri çözülür", /^[A-Z0-9]+$/.test(oid) && orderIdFromMerchantOid(oid) === 42 && orderIdFromMerchantOid("abc") === null);
// PayTR dokümanındaki PHP örneğiyle aynı dizilim:
//   hash_str = merchant_id.user_ip.merchant_oid.email.payment_amount.user_basket.no_installment.max_installment.currency.test_mode
//   paytr_token = base64_encode(hash_hmac('sha256', hash_str.merchant_salt, merchant_key, true))  → salt metnin sonuna, anahtar merchant_key
const ref = (p: { merchantId: string; key: string; salt: string; userIp: string; merchantOid: string; email: string; amount: number; basket: string; noInstallment: string; maxInstallment: string; currency: string; testMode: string }) =>
  createHmac("sha256", p.key).update(`${p.merchantId}${p.userIp}${p.merchantOid}${p.email}${p.amount}${p.basket}${p.noInstallment}${p.maxInstallment}${p.currency}${p.testMode}${p.salt}`).digest("base64");
const sample = { merchantId: "123456", key: "testkey", salt: "testsalt", userIp: "1.2.3.4", merchantOid: oid, email: "a@b.c", amount: 10050, basket: "W10=", noInstallment: "0", maxInstallment: "0", currency: "TL", testMode: "1" };
check("token imzası referans hesapla aynı", tokenHash(sample) === ref(sample));
check("bildirim imzası: oid+salt+status+total", callbackHash({ key: "testkey", salt: "testsalt", merchantOid: oid, status: "success", totalAmount: "10050" }) === createHmac("sha256", "testkey").update(`${oid}testsaltsuccess10050`).digest("base64"));
check("ödeme yolu: paytr seçili + anahtar var → paytr; 0 TL → free; manual → manual", (await resolvePaymentMode({ provider: "paytr" }, 100)) === "paytr" && (await resolvePaymentMode({ provider: "paytr" }, 0)) === "free" && (await resolvePaymentMode({ provider: "manual" }, 100)) === "manual");

// ---- 2) Bildirim ucu
const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
const [course] = await db.select({ id: courses.id, title: courses.title }).from(courses).where(eq(courses.status, "published")).limit(1);
if (!admin || !course) throw new Error("Seed gerekli (admin + yayında kurs).");
const stamp = Date.now().toString(36);
let userId = 0;
const orderIds: number[] = [];
const notify = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return POST(new Request("http://localhost/api/odeme/paytr", { method: "POST", body: fd }));
};
const mkOrder = async (total: string, oidFor?: (id: number) => string) => {
  const [o] = await db.insert(orders).values({ userId, status: "pending", items: [{ courseId: course.id, title: course.title, price: Number(total), periodId: null, periodName: null }], subtotal: total, discount: "0", total, provider: "paytr", billing: { name: "PayTR Test", email: `paytr-test-${stamp}@example.invalid`, phone: "", address: "", city: "" } }).returning({ id: orders.id });
  const m = (oidFor ?? newMerchantOid)(o.id);
  await db.update(orders).set({ providerToken: m }).where(eq(orders.id, o.id));
  orderIds.push(o.id);
  return { id: o.id, oid: m };
};
const signed = (merchantOid: string, status: string, total: string, extra: Record<string, string> = {}) => ({ merchant_oid: merchantOid, status, total_amount: total, hash: callbackHash({ key: "testkey", salt: "testsalt", merchantOid, status, totalAmount: total }), ...extra });
const orderRow = async (id: number) => (await db.select().from(orders).where(eq(orders.id, id)).limit(1))[0];
try {
  const [u] = await db.insert(users).values({ email: `paytr-test-${stamp}@example.invalid`, firstName: "PayTR", lastName: "Test", passwordHash: "x", role: "student", notifyPrefs: {} }).returning();
  userId = u.id;

  // sahte imza
  const a = await mkOrder("100.50");
  const r1 = await notify({ merchant_oid: a.oid, status: "success", total_amount: "10050", hash: "yanlis" });
  check("sahte imza reddedilir (400), sipariş değişmez", r1.status === 400 && (await orderRow(a.id)).status === "pending");
  check("verifyNotification sahte imzada null", (await verifyNotification((() => { const f = new FormData(); f.set("merchant_oid", a.oid); f.set("status", "success"); f.set("total_amount", "10050"); f.set("hash", "x"); return f; })())) === null);
  // tutar uyuşmazlığı
  const r2 = await notify(signed(a.oid, "success", "9999"));
  const a2 = await orderRow(a.id);
  check("tutar uyuşmazlığı: OK döner, sipariş başarısız olur", r2.status === 200 && (await r2.text()) === "OK" && a2.status === "failed" && /eşleşmedi/.test(a2.note ?? ""));
  // başarılı ödeme (failed durumundan yeniden deneme)
  const r3 = await notify(signed(a.oid, "success", "10050", { payment_type: "card", test_mode: "1" }));
  const a3 = await orderRow(a.id);
  check("başarılı bildirim: OK, sipariş ödendi, ödeme no = sipariş no", r3.status === 200 && a3.status === "paid" && a3.providerPaymentId === a.oid && !!a3.paidAt);
  const enr = await db.select().from(enrollments).where(eq(enrollments.userId, userId));
  check("başarılı bildirim: öğrenci kursa kaydedildi", enr.some((e) => e.courseId === course.id && e.status === "active"));
  const r4 = await notify(signed(a.oid, "success", "10050"));
  check("tekrar gelen bildirim: OK, ikinci kez işlenmez", r4.status === 200 && (await orderRow(a.id)).status === "paid");
  // başarısız ödeme
  const b = await mkOrder("250.00");
  const r5 = await notify(signed(b.oid, "failed", "25000", { failed_reason_code: "6", failed_reason_msg: "Kart limiti yetersiz" }));
  const b2 = await orderRow(b.id);
  check("başarısız bildirim: OK, sipariş başarısız + neden", r5.status === 200 && b2.status === "failed" && /limiti/.test(b2.note ?? ""));
  // eşleşmeyen sipariş numarası (eski deneme)
  const c = await mkOrder("300.00");
  const stale = newMerchantOid(c.id);
  const r6 = await notify(signed(stale, "success", "30000"));
  check("siparişe kayıtlı olmayan sipariş no: OK ama sipariş değişmez", r6.status === 200 && (await orderRow(c.id)).status === "pending");
} finally {
  for (const id of orderIds) await db.delete(orders).where(eq(orders.id, id));
  if (userId) await db.delete(users).where(eq(users.id, userId));
  await setSetting("payment", { paytrMerchantId: paymentBefore.paytrMerchantId, paytrKey: paymentBefore.paytrKey, paytrSalt: paymentBefore.paytrSalt });
}
console.log(fails ? `\n${fails} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
process.exit(fails ? 1 : 0);
