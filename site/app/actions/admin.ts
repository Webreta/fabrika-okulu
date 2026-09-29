"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, orders, enrollments, periods, pages, certificateTemplates, issuedCertificates, contactMessages, coupons, surveys, surveyAnswers, surveyCompletions, notifications } from "@/db/schema";
import type { CertFields, CertRule, SurveyMode, SurveyQuestion } from "@/db/schema";
import { normalizeSurveyDef, validateSurveyDef } from "@/lib/survey-logic";
import { requireAdmin, destroyAllSessions } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { setSetting, setRawSetting, SECRET_FIELDS, type SettingsKey, type SettingsMap } from "@/lib/settings";
import { sendTestMail } from "@/lib/mailer";
import { enrollUser, unenrollUser, moveEnrollmentPeriod, fulfillOrder } from "@/lib/enroll";
import { releaseOrderCoupon } from "@/lib/orders";
import { saveUploadedFile, IMAGE_EXTENSIONS, slugify } from "@/lib/uploads";
import { DEFAULT_CERT_FIELDS, DEFAULT_CERT_RULE } from "@/lib/certificates";
import { notifyUsers } from "@/lib/notify";
import type { ActionResult } from "@/app/actions/teacher";
import type { FormState } from "@/app/actions/auth";
import { markSeen, SEEN_SECTIONS, type SeenSection } from "@/lib/admin-seen";
import { ne } from "drizzle-orm";
import { courses as courseTable } from "@/db/schema";
import { groupFromSlug } from "@/lib/course-logic";
import { isUniqueViolation, isForeignKeyViolation, isNumericError } from "@/lib/db-errors";
import { LIMITS, COUPON_MAX_AMOUNT, COUPON_MAX_USAGE, COUPON_MAX_DAYS, tooLong, firstError, isEmail } from "@/lib/limits";

// ---------- Ayarlar ----------

export async function saveSettings<K extends SettingsKey>(key: K, value: Partial<SettingsMap[K]>): Promise<ActionResult> {
  await requireAdmin();
  // Gizli alanlar (SMTP şifresi) tarayıcıya gönderilmez; formdan boş gelen değer "değiştirme" demektir
  const patch = { ...value } as Record<string, unknown>;
  for (const f of SECRET_FIELDS[key] ?? []) {
    if (typeof patch[f] !== "string" || patch[f] === "") delete patch[f];
  }
  await setSetting(key, patch as Partial<SettingsMap[K]>);
  revalidatePath("/", "layout");
  return { ok: true, message: "Kaydedildi." };
}

/** Kayıtlı gizli alanı (ör. SMTP şifresi) siler; yalnızca `SECRET_FIELDS` içindeki alanlar için */
export async function clearSettingSecret(key: SettingsKey, field: string): Promise<ActionResult> {
  await requireAdmin();
  if (!(SECRET_FIELDS[key] ?? []).includes(field)) return { ok: false, error: "Bu alan silinemez." };
  await setSetting(key, { [field]: "" } as Partial<SettingsMap[typeof key]>);
  revalidatePath("/", "layout");
  return { ok: true, message: "Kayıtlı şifre silindi." };
}

export async function saveRawSetting(key: string, value: unknown): Promise<ActionResult> {
  await requireAdmin();
  await setRawSetting(key, value);
  revalidatePath("/", "layout");
  return { ok: true, message: "Kaydedildi." };
}

export async function testSmtp(to: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await sendTestMail(to);
    return { ok: true, message: `Test maili ${to} adresine gönderildi.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gönderilemedi." };
  }
}

export async function uploadSiteImage(formData: FormData) {
  await requireAdmin();
  const up = await saveUploadedFile(formData.get("file"), "site", IMAGE_EXTENSIONS, 10 * 1024 * 1024);
  if (!up.ok) return up;
  return { ok: true as const, url: up.publicPath ?? "" };
}

// ---------- Sayfalar ----------

// Sitede kendi sayfası olan adresler: bu adla serbest sayfa açılamaz (açılsa da o adreste hiç görünmezdi)
const RESERVED_PAGE_SLUGS = new Set([
  "admin", "panel", "egitmen", "api", "uploads", "kurs-izle", "sertifika", "program", "kategori", "kesfet", "rotam",
  "sepet", "odeme", "sss", "iletisim", "hakkimizda", "img", "fonts", "sitemap", "robots", "manifest", "favicon",
]);

export async function savePage(input: { id?: number; slug: string; title: string; html: string; published: boolean }): Promise<ActionResult> {
  await requireAdmin();
  const title = String(input.title ?? "").trim();
  const rawSlug = String(input.slug ?? "").trim();
  const html = String(input.html ?? "");
  if (!title) return { ok: false, error: "Başlık gerekli." };
  const lenErr = firstError(tooLong("Başlık", title, LIMITS.pageTitle), tooLong("Adres", rawSlug, LIMITS.pageSlug), tooLong("İçerik", html, LIMITS.pageHtml));
  if (lenErr) return { ok: false, error: lenErr };
  // Adres boşsa başlıktan üretilir; Türkçe harf/boşluk içeren adres küçük harf ve tireye çevrilir (sonuç mesajda yazar)
  const slug = slugify(rawSlug || title, LIMITS.pageSlug);
  if (!slug) return { ok: false, error: "Adres yalnızca harf, rakam ve tire içerebilir; en az bir harf ya da rakam yaz." };
  if (RESERVED_PAGE_SLUGS.has(slug) || groupFromSlug(slug)) return { ok: false, error: `"/${slug}" adresi sitenin kendi sayfası için ayrılmış; başka bir adres yaz.` };
  const [clash] = await db.select({ id: pages.id, title: pages.title }).from(pages).where(input.id ? and(eq(pages.slug, slug), ne(pages.id, input.id)) : eq(pages.slug, slug)).limit(1);
  if (clash) return { ok: false, error: `Bu adres başka bir sayfada kullanılıyor ("${clash.title}"). Farklı bir adres yaz.` };
  const v = { slug, title, html, published: !!input.published, updatedAt: new Date() };
  try {
    if (input.id) {
      const [old] = await db.select({ slug: pages.slug }).from(pages).where(eq(pages.id, input.id)).limit(1);
      if (!old) return { ok: false, error: "Sayfa bulunamadı (silinmiş olabilir)." };
      await db.update(pages).set(v).where(eq(pages.id, input.id));
      if (old.slug !== slug) revalidatePath(`/${old.slug}`);
    } else await db.insert(pages).values(v);
  } catch (e) {
    // Aynı anda iki kayıt: tekil adres kuralına takılır
    if (isUniqueViolation(e)) return { ok: false, error: "Bu adres başka bir sayfada kullanılıyor. Farklı bir adres yaz." };
    throw e;
  }
  revalidatePath(`/${slug}`); revalidatePath("/admin/icerik");
  return { ok: true, message: `Sayfa kaydedildi. Adres: /${slug}` };
}

export async function deletePage(id: number): Promise<ActionResult> {
  await requireAdmin();
  await db.delete(pages).where(eq(pages.id, id));
  revalidatePath("/admin/icerik");
  return { ok: true };
}

// ---------- Kullanıcılar ----------

const USER_ROLES = ["admin", "teacher", "student"];

export async function createUser(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "student") as "admin" | "teacher" | "student";
  if (!isEmail(email)) return { error: "Geçerli bir e-posta adresi gerekli." };
  if (!firstName) return { error: "Ad gerekli." };
  // Yeni şifre kuralı (kayıt formuyla aynı): en az 8 karakter, yalnızca boşluktan oluşamaz
  if (password.length < 8 || !password.trim()) return { error: "Şifre en az 8 karakter olmalı ve yalnızca boşluktan oluşamaz." };
  if (!USER_ROLES.includes(role)) return { error: "Geçersiz rol." };
  const lenErr = firstError(tooLong("Ad", firstName, LIMITS.firstName), tooLong("Soyad", lastName, LIMITS.lastName), tooLong("E-posta", email, LIMITS.email), tooLong("Şifre", password, LIMITS.password));
  if (lenErr) return { error: lenErr };
  const [ex] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (ex) return { error: "Bu e-posta zaten kayıtlı." };
  try {
    await db.insert(users).values({ email, firstName, lastName, passwordHash: await hashPassword(password), role, isSuperTeacher: formData.get("super") === "1" });
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "Bu e-posta zaten kayıtlı." };
    throw e;
  }
  revalidatePath("/admin/kullanicilar");
  return { ok: "Kullanıcı oluşturuldu." };
}

export async function updateUser(id: number, patch: { role?: "admin" | "teacher" | "student"; isSuperTeacher?: boolean; active?: boolean; firstName?: string; lastName?: string; phone?: string; password?: string }): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (id === admin.id && (patch.role && patch.role !== "admin" || patch.active === false)) return { ok: false, error: "Kendi yetkini düşüremezsin." };
  if (patch.role && !USER_ROLES.includes(patch.role)) return { ok: false, error: "Geçersiz rol." };
  const firstName = patch.firstName?.trim(), lastName = patch.lastName?.trim(), phone = patch.phone?.trim();
  if (firstName !== undefined && !firstName) return { ok: false, error: "Ad boş olamaz." };
  const lenErr = firstError(tooLong("Ad", firstName, LIMITS.firstName), tooLong("Soyad", lastName, LIMITS.lastName), tooLong("Telefon", phone, LIMITS.phone), tooLong("Şifre", patch.password, LIMITS.password));
  if (lenErr) return { ok: false, error: lenErr };
  const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (patch.role) set.role = patch.role;
  if (patch.isSuperTeacher !== undefined) set.isSuperTeacher = patch.isSuperTeacher;
  if (patch.active !== undefined) set.active = patch.active;
  if (firstName !== undefined) set.firstName = firstName;
  if (lastName !== undefined) set.lastName = lastName;
  if (phone !== undefined) set.phone = phone;
  if (patch.password) { if (patch.password.length < 8 || !patch.password.trim()) return { ok: false, error: "Şifre en az 8 karakter olmalı ve yalnızca boşluktan oluşamaz." }; set.passwordHash = await hashPassword(patch.password); await destroyAllSessions(id); }
  await db.update(users).set(set).where(eq(users.id, id));
  if (patch.active === false) await destroyAllSessions(id);
  revalidatePath("/admin/kullanicilar"); revalidatePath("/admin/ogrenciler");
  return { ok: true, message: "Güncellendi." };
}

export async function deleteUser(id: number): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (id === admin.id) return { ok: false, error: "Kendini silemezsin." };
  // Mali kayıt ve verilmiş sertifika kullanıcıyla birlikte silinirdi (veritabanında bağlı kayıtlar zincirleme silinir).
  // Siparişi ya da sertifikası olan hesap silinmez; erişimi kesmek için hesap pasif yapılır.
  const [{ o }] = await db.select({ o: sql<number>`count(*)`.mapWith(Number) }).from(orders).where(eq(orders.userId, id));
  const [{ c }] = await db.select({ c: sql<number>`count(*)`.mapWith(Number) }).from(issuedCertificates).where(eq(issuedCertificates.userId, id));
  if (o > 0 || c > 0) {
    const what = [o > 0 ? `${o} sipariş` : "", c > 0 ? `${c} sertifika` : ""].filter(Boolean).join(" ve ");
    return { ok: false, error: `Bu kullanıcının ${what} kaydı var; silinirse bu kayıtlar da yok olur. Silmek yerine "Hesap aktif" işaretini kaldırıp hesabı pasif yap (giriş yapamaz, kayıtları durur).` };
  }
  await db.delete(users).where(eq(users.id, id));
  revalidatePath("/admin/kullanicilar"); revalidatePath("/admin/ogrenciler");
  return { ok: true, message: "Kullanıcı silindi." };
}

// ---------- Öğrenci kayıtları ----------

export async function adminEnroll(userId: number, courseId: number): Promise<ActionResult> {
  await requireAdmin();
  const [ex] = await db.select().from(enrollments).where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))).limit(1);
  if (ex && ex.status === "active") return { ok: false, error: "Zaten kayıtlı." };
  await enrollUser({ userId, courseId, orderId: 0 });
  revalidatePath("/admin/ogrenciler");
  return { ok: true, message: "Kayıt eklendi." };
}

export async function adminUnenroll(userId: number, courseId: number): Promise<ActionResult> {
  await requireAdmin();
  const r = await unenrollUser(userId, courseId);
  revalidatePath("/admin/ogrenciler"); revalidatePath("/admin/siparisler");
  if (!r.removed) return { ok: false, error: "Kayıt bulunamadı." };
  // Siparişe ne olduğu yöneticiye açıkça söylenir
  const tail = r.order === "cancelled" ? ` Sipariş #${r.orderId} içinde başka eğitim kalmadığı için "İptal" olarak işaretlendi.`
    : r.order === "kept" ? ` Sipariş #${r.orderId} ödenmiş kaldı (siparişteki diğer eğitim sürüyor); sipariş notuna yazıldı.` : "";
  return { ok: true, message: `Kayıt kaldırıldı.${tail}` };
}

export async function adminUnenrollAll(userId: number): Promise<ActionResult> {
  await requireAdmin();
  const list = await db.select({ courseId: enrollments.courseId }).from(enrollments).where(eq(enrollments.userId, userId));
  const cancelled: number[] = [];
  for (const e of list) { const r = await unenrollUser(userId, e.courseId); if (r.order === "cancelled" && r.orderId) cancelled.push(r.orderId); }
  revalidatePath("/admin/ogrenciler"); revalidatePath("/admin/siparisler");
  return { ok: true, message: `Tüm kayıtlar kaldırıldı.${cancelled.length ? ` İptal olarak işaretlenen sipariş: ${cancelled.map((id) => `#${id}`).join(", ")}.` : ""}` };
}

// ---------- Siparişler ----------

export async function setOrderStatus(orderId: number, status: "paid" | "cancelled" | "refunded" | "pending"): Promise<ActionResult> {
  await requireAdmin();
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o) return { ok: false, error: "Sipariş yok." };
  // Durum geçiş kuralları: aynı duruma geçiş etkisizdir; iade yalnızca ödenmiş siparişe yapılır; iade edilmiş sipariş yeniden "ödendi" yapılamaz
  if (o.status === status) return { ok: true, message: status === "paid" ? "Sipariş zaten ödenmiş; yeniden işlem yapılmadı." : "Sipariş zaten bu durumda." };
  if (status === "refunded" && o.status !== "paid") return { ok: false, error: "İade yalnızca ödenmiş siparişe yapılabilir." };
  if (status === "paid" && o.status === "refunded") return { ok: false, error: "İade edilmiş sipariş yeniden ödenmiş yapılamaz. Öğrenci yeniden sipariş vermeli ya da kayıt elle eklenmeli." };
  if (status === "paid") {
    const r = await fulfillOrder(orderId);
    if (!r.ok) return { ok: false, error: "Sipariş ödenmiş olarak işaretlenemedi." };
  } else {
    // Ödenmişlikten çıkan sipariş: kayıt işaretini sıfırla (yeniden onaylanırsa kayıt ve e-postalar yeniden yapılır), kuponu geri bırak
    await db.update(orders).set({ status, fulfilledAt: null }).where(eq(orders.id, orderId));
    if (status === "cancelled" || status === "refunded") {
      await releaseOrderCoupon(orderId);
      for (const item of o.items) {
        const [e] = await db.select().from(enrollments).where(and(eq(enrollments.userId, o.userId), eq(enrollments.courseId, item.courseId), eq(enrollments.orderId, o.id))).limit(1);
        if (e) await unenrollUser(o.userId, item.courseId);
      }
    }
  }
  revalidatePath("/admin/siparisler"); revalidatePath("/admin/kuponlar");
  return { ok: true, message: "Sipariş güncellendi." };
}

export async function updateOrderPeriod(orderId: number, courseId: number, periodId: number | null): Promise<ActionResult> {
  await requireAdmin();
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o) return { ok: false, error: "Sipariş yok." };
  if (!o.items.some((i) => i.courseId === courseId)) return { ok: false, error: "Bu eğitim siparişte yok." };
  let periodName: string | null = null;
  if (periodId) {
    const [p] = await db.select({ name: periods.name }).from(periods).where(and(eq(periods.id, periodId), eq(periods.courseId, courseId))).limit(1);
    if (!p) return { ok: false, error: "Dönem bu eğitime ait değil." };
    periodName = p.name;
  }
  const items = o.items.map((i) => (i.courseId === courseId ? { ...i, periodId, periodName } : i));
  await db.update(orders).set({ items }).where(eq(orders.id, orderId));
  let note = "";
  if (o.status === "paid") {
    // Yalnızca dönem kaydı taşınır: sipariş ödenmiş kalır, kurs kaydı (başlangıç tarihi, ilerleme) korunur
    const [e] = await db.select({ id: enrollments.id, status: enrollments.status }).from(enrollments).where(and(eq(enrollments.userId, o.userId), eq(enrollments.courseId, courseId))).limit(1);
    if (!e || e.status !== "active") await enrollUser({ userId: o.userId, courseId, orderId: o.id, periodId, sendWelcome: false });
    const r = await moveEnrollmentPeriod({ userId: o.userId, courseId, periodId, orderId: o.id });
    if (!r.ok) return { ok: false, error: r.error };
    if (r.overCapacity) note = ` Dikkat: dönemin kontenjanı aşıldı (${r.enrolled}/${r.capacity}).`;
  }
  revalidatePath("/admin/siparisler"); revalidatePath("/admin/ogrenciler");
  return { ok: true, message: `Dönem güncellendi.${note}` };
}

// ---------- Sertifika tasarımları ----------

export async function saveCertificateTemplate(input: { id?: number; title: string; imageUrl: string; imageWidth: number; imageHeight: number; fields: CertFields; rule: CertRule; sampleName: string; sampleCourse: string }): Promise<ActionResult> {
  await requireAdmin();
  const v = {
    title: input.title.trim() || "İsimsiz sertifika", imageUrl: input.imageUrl, imageWidth: input.imageWidth || 1600, imageHeight: input.imageHeight || 1131,
    fields: { ...DEFAULT_CERT_FIELDS, ...input.fields }, rule: { ...DEFAULT_CERT_RULE, ...input.rule }, sampleName: input.sampleName, sampleCourse: input.sampleCourse,
  };
  let id = input.id;
  if (id) await db.update(certificateTemplates).set(v).where(eq(certificateTemplates.id, id));
  else { const [c] = await db.insert(certificateTemplates).values(v).returning({ id: certificateTemplates.id }); id = c.id; }
  revalidatePath("/admin/sertifikalar");
  return { ok: true, id };
}

export async function duplicateCertificateTemplate(id: number): Promise<ActionResult> {
  await requireAdmin();
  const [t] = await db.select().from(certificateTemplates).where(eq(certificateTemplates.id, id)).limit(1);
  if (!t) return { ok: false, error: "Tasarım bulunamadı." };
  const { id: _id, createdAt: _ca, ...rest } = t;
  void _id; void _ca;
  // Kopya güvenli başlar: otomatik verme kapalı gelir, isteyerek açılır
  const [c] = await db.insert(certificateTemplates).values({ ...rest, title: `${t.title} (Kopya)`, rule: { ...t.rule, auto: false } }).returning({ id: certificateTemplates.id });
  revalidatePath("/admin/sertifikalar");
  return { ok: true, id: c.id };
}

export async function deleteCertificateTemplate(id: number): Promise<ActionResult> {
  await requireAdmin();
  await db.delete(issuedCertificates).where(eq(issuedCertificates.templateId, id));
  await db.delete(certificateTemplates).where(eq(certificateTemplates.id, id));
  revalidatePath("/admin/sertifikalar");
  return { ok: true };
}

export async function uploadCertificateImage(formData: FormData) {
  await requireAdmin();
  const up = await saveUploadedFile(formData.get("file"), "sertifika", IMAGE_EXTENSIONS, 15 * 1024 * 1024);
  if (!up.ok) return up;
  return { ok: true as const, url: up.publicPath ?? "" };
}

// ---------- Anket tanımı ----------

export async function saveSurveyAdmin(input: { id?: number; title: string; intro: string; mode?: SurveyMode; editable?: boolean; required?: boolean; sections: Record<string, string>; questions: SurveyQuestion[] }): Promise<ActionResult> {
  await requireAdmin();
  const def = normalizeSurveyDef(input);
  const errors = validateSurveyDef(def);
  if (errors.length) return { ok: false, error: errors.join(" ") };
  const { questions, sections, mode } = def;
  const editable = def.editable !== false;
  const required = def.required === true;
  const title = def.title || "İsimsiz anket";
  if (input.id) {
    await db.update(surveys).set({ title, intro: def.intro, mode, editable, required, sections, questions }).where(eq(surveys.id, input.id));
    // Zorunluluk panel kabuğunu (menü kilidi) etkiler
    revalidatePath("/admin/anketler"); revalidatePath("/panel", "layout");
    return { ok: true, id: input.id, message: "Kaydedildi." };
  }
  // Anahtar başlıktan türetilir; çakışırsa sonek eklenir
  const base = slugify(title).replace(/-/g, "_") || "anket";
  let key = base;
  for (let i = 2; i < 100; i++) {
    const [ex] = await db.select({ id: surveys.id }).from(surveys).where(eq(surveys.key, key)).limit(1);
    if (!ex) break;
    key = `${base}_${i}`;
  }
  const [c] = await db.insert(surveys).values({ key, title, intro: def.intro, mode, editable, required, sections, questions, status: "draft" }).returning({ id: surveys.id });
  revalidatePath("/admin/anketler");
  return { ok: true, id: c.id, message: "Anket oluşturuldu (taslak)." };
}

export async function publishSurvey(id: number, publish: boolean): Promise<ActionResult> {
  await requireAdmin();
  const [s] = await db.select().from(surveys).where(eq(surveys.id, id)).limit(1);
  if (!s) return { ok: false, error: "Anket bulunamadı." };
  await db.update(surveys).set({ status: publish ? "published" : "draft", publishedAt: publish ? new Date() : s.publishedAt }).where(eq(surveys.id, id));
  let sent = 0;
  if (publish) {
    // Bildirim: yalnızca testi tamamlamamış VE bu anket için daha önce bildirim almamış öğrencilere gider
    // (anket yayından kaldırılıp yeniden yayınlandığında herkese yeniden bildirim gitmez). Panel popup'ı girişte ayrıca görünür.
    const tag = `survey-${s.id}`;
    const [all, done, told] = await Promise.all([
      db.select({ id: users.id }).from(users).where(and(eq(users.role, "student"), eq(users.active, true))),
      db.select({ id: surveyCompletions.userId }).from(surveyCompletions).where(eq(surveyCompletions.surveyKey, s.key)),
      db.selectDistinct({ id: notifications.userId }).from(notifications).where(eq(notifications.tag, tag)),
    ]);
    const skip = new Set([...done, ...told].map((r) => r.id));
    const ids = all.map((r) => r.id).filter((x) => !skip.has(x));
    if (ids.length) sent = await notifyUsers(ids, { title: "Yeni anket yayında", body: s.title, url: `/panel/anket/${s.id}`, tag });
  }
  revalidatePath("/admin/anketler"); revalidatePath("/panel", "layout");
  return {
    ok: true,
    message: !publish ? "Anket yayından kaldırıldı."
      : sent > 0 ? `Anket yayınlandı, ${sent} öğrenciye bildirildi.`
      : "Anket yayınlandı. Yeni bildirim gönderilmedi (öğrenciler daha önce bilgilendirilmiş ya da testi tamamlamış).",
  };
}

export async function deleteSurvey(id: number): Promise<ActionResult> {
  await requireAdmin();
  const [s] = await db.select().from(surveys).where(eq(surveys.id, id)).limit(1);
  if (!s) return { ok: false, error: "Anket bulunamadı." };
  await db.delete(surveyAnswers).where(eq(surveyAnswers.surveyKey, s.key));
  await db.delete(surveyCompletions).where(eq(surveyCompletions.surveyKey, s.key));
  await db.delete(surveys).where(eq(surveys.id, id));
  revalidatePath("/admin/anketler"); revalidatePath("/panel/anket");
  return { ok: true };
}

export async function resetUserSurvey(userId: number, surveyKey: string): Promise<ActionResult> {
  await requireAdmin();
  await db.delete(surveyAnswers).where(and(eq(surveyAnswers.userId, userId), eq(surveyAnswers.surveyKey, surveyKey)));
  await db.delete(surveyCompletions).where(and(eq(surveyCompletions.userId, userId), eq(surveyCompletions.surveyKey, surveyKey)));
  return { ok: true };
}

// ---------- İletişim mesajları / kuponlar ----------

export async function markMessageRead(id: number, read = true): Promise<ActionResult> {
  await requireAdmin();
  await db.update(contactMessages).set({ read }).where(eq(contactMessages.id, id));
  revalidatePath("/admin/mesajlar");
  return { ok: true };
}

export async function deleteMessage(id: number): Promise<ActionResult> {
  await requireAdmin();
  await db.delete(contactMessages).where(eq(contactMessages.id, id));
  revalidatePath("/admin/mesajlar");
  return { ok: true };
}

export async function createGeneralCoupon(input: { code: string; kind?: "percent" | "amount"; percent: number; amount?: number; courseId: number; usageLimit: number; expiryDays?: number }): Promise<ActionResult> {
  await requireAdmin();
  const code = String(input.code ?? "").trim().toUpperCase();
  const fixed = input.kind === "amount";
  const rawAmount = Number(input.amount ?? 0);
  const amount = fixed ? Math.round(rawAmount * 100) / 100 : 0;
  const percent = Number(input.percent);
  const usageLimit = Number(input.usageLimit ?? 0);
  const expiryDays = Number(input.expiryDays ?? 0);
  const courseId = Number(input.courseId ?? 0);
  if (!code) return { ok: false, error: "Kupon kodu gerekli." };
  if (code.length > LIMITS.couponCode) return { ok: false, error: `Kupon kodu en fazla ${LIMITS.couponCode} karakter olabilir.` };
  if (!/^[\p{L}\p{N}_-]+$/u.test(code)) return { ok: false, error: "Kupon kodu yalnızca harf, rakam, tire ve alt çizgi içerebilir (boşluk olamaz)." };
  if (fixed && (!Number.isFinite(rawAmount) || amount <= 0)) return { ok: false, error: "Sabit tutar 0'dan büyük olmalı." };
  if (fixed && amount > COUPON_MAX_AMOUNT) return { ok: false, error: `Sabit tutar en fazla ${COUPON_MAX_AMOUNT.toLocaleString("tr-TR")} TL olabilir.` };
  if (!fixed && (!Number.isInteger(percent) || percent < 1 || percent > 100)) return { ok: false, error: "Yüzde 1 ile 100 arasında tam sayı olmalı (ondalık yazılamaz; örneğin 12.5 yerine 12 ya da 13)." };
  if (!Number.isInteger(usageLimit) || usageLimit < 0 || usageLimit > COUPON_MAX_USAGE) return { ok: false, error: "Kullanım limiti 0 ya da daha büyük bir tam sayı olmalı (0 = sınırsız)." };
  if (!Number.isInteger(expiryDays) || expiryDays < 0 || expiryDays > COUPON_MAX_DAYS) return { ok: false, error: `Geçerlilik süresi 0 ile ${COUPON_MAX_DAYS} gün arasında tam sayı olmalı (0 = süresiz).` };
  if (!Number.isInteger(courseId) || courseId < 0) return { ok: false, error: "Geçersiz eğitim seçimi." };
  if (courseId > 0) {
    const [c] = await db.select({ id: courseTable.id }).from(courseTable).where(eq(courseTable.id, courseId)).limit(1);
    if (!c) return { ok: false, error: "Seçilen eğitim bulunamadı." };
  }
  const [ex] = await db.select({ id: coupons.id }).from(coupons).where(eq(coupons.code, code)).limit(1);
  if (ex) return { ok: false, error: "Bu kod zaten var." };
  try {
    await db.insert(coupons).values({ code, percent: fixed ? 0 : percent, amount: fixed ? amount.toFixed(2) : null, courseId: courseId > 0 ? courseId : null, usageLimit, expiresAt: expiryDays > 0 ? new Date(Date.now() + expiryDays * 86400000) : null });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "Bu kod zaten var." };
    if (isForeignKeyViolation(e)) return { ok: false, error: "Seçilen eğitim bulunamadı." };
    if (isNumericError(e)) return { ok: false, error: "Girilen sayılardan biri çok büyük ya da geçersiz." };
    throw e;
  }
  revalidatePath("/admin/kuponlar");
  return { ok: true, message: `Kupon oluşturuldu: ${code}` };
}

export async function deleteCoupon(id: number): Promise<ActionResult> {
  await requireAdmin();
  await db.delete(coupons).where(eq(coupons.id, id));
  revalidatePath("/admin/kuponlar");
  return { ok: true };
}

export async function markSectionSeen(section: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!(SEEN_SECTIONS as readonly string[]).includes(section)) return { ok: false, error: "bilinmeyen bölüm" };
  await markSeen(admin.id, section as SeenSection);
  return { ok: true };
}
