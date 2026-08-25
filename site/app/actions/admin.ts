"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, orders, enrollments, pages, certificateTemplates, issuedCertificates, contactMessages, coupons } from "@/db/schema";
import type { CertFields, CertRule } from "@/db/schema";
import { requireAdmin, destroyAllSessions } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { setSetting, setRawSetting, type SettingsKey, type SettingsMap } from "@/lib/settings";
import { sendTestMail } from "@/lib/mailer";
import { enrollUser, unenrollUser, fulfillOrder } from "@/lib/enroll";
import { saveUploadedFile, IMAGE_EXTENSIONS, slugify } from "@/lib/uploads";
import { DEFAULT_CERT_FIELDS, DEFAULT_CERT_RULE } from "@/lib/certificates";
import { notifyUsers } from "@/lib/notify";
import type { SurveySchema } from "@/lib/survey";
import type { ActionResult } from "@/app/actions/teacher";
import type { FormState } from "@/app/actions/auth";
import { markSeen, SEEN_SECTIONS, type SeenSection } from "@/lib/admin-seen";

// ---------- Ayarlar ----------

export async function saveSettings<K extends SettingsKey>(key: K, value: Partial<SettingsMap[K]>): Promise<ActionResult> {
  await requireAdmin();
  await setSetting(key, value);
  revalidatePath("/", "layout");
  return { ok: true, message: "Kaydedildi." };
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

export async function savePage(input: { id?: number; slug: string; title: string; html: string; published: boolean }): Promise<ActionResult> {
  await requireAdmin();
  const slug = slugify(input.slug || input.title);
  if (!slug || !input.title.trim()) return { ok: false, error: "Başlık ve slug gerekli." };
  const v = { slug, title: input.title.trim(), html: input.html, published: input.published, updatedAt: new Date() };
  if (input.id) await db.update(pages).set(v).where(eq(pages.id, input.id));
  else await db.insert(pages).values(v);
  revalidatePath(`/${slug}`); revalidatePath("/admin/icerik");
  return { ok: true, message: "Sayfa kaydedildi." };
}

export async function deletePage(id: number): Promise<ActionResult> {
  await requireAdmin();
  await db.delete(pages).where(eq(pages.id, id));
  revalidatePath("/admin/icerik");
  return { ok: true };
}

// ---------- Kullanıcılar ----------

export async function createUser(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "student") as "admin" | "teacher" | "student";
  if (!email.includes("@") || password.length < 6 || !firstName) return { error: "E-posta, ad ve en az 6 karakterli şifre gerekli." };
  const [ex] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (ex) return { error: "Bu e-posta zaten kayıtlı." };
  await db.insert(users).values({ email, firstName, lastName, passwordHash: await hashPassword(password), role, isSuperTeacher: formData.get("super") === "1" });
  revalidatePath("/admin/kullanicilar");
  return { ok: "Kullanıcı oluşturuldu." };
}

export async function updateUser(id: number, patch: { role?: "admin" | "teacher" | "student"; isSuperTeacher?: boolean; active?: boolean; firstName?: string; lastName?: string; phone?: string; password?: string }): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (id === admin.id && (patch.role && patch.role !== "admin" || patch.active === false)) return { ok: false, error: "Kendi yetkini düşüremezsin." };
  const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (patch.role) set.role = patch.role;
  if (patch.isSuperTeacher !== undefined) set.isSuperTeacher = patch.isSuperTeacher;
  if (patch.active !== undefined) set.active = patch.active;
  if (patch.firstName !== undefined) set.firstName = patch.firstName;
  if (patch.lastName !== undefined) set.lastName = patch.lastName;
  if (patch.phone !== undefined) set.phone = patch.phone;
  if (patch.password) { if (patch.password.length < 6) return { ok: false, error: "Şifre en az 6 karakter." }; set.passwordHash = await hashPassword(patch.password); await destroyAllSessions(id); }
  await db.update(users).set(set).where(eq(users.id, id));
  if (patch.active === false) await destroyAllSessions(id);
  revalidatePath("/admin/kullanicilar"); revalidatePath("/admin/ogrenciler");
  return { ok: true, message: "Güncellendi." };
}

export async function deleteUser(id: number): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (id === admin.id) return { ok: false, error: "Kendini silemezsin." };
  await db.delete(users).where(eq(users.id, id));
  revalidatePath("/admin/kullanicilar");
  return { ok: true };
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
  await unenrollUser(userId, courseId);
  revalidatePath("/admin/ogrenciler");
  return { ok: true, message: "Kayıt kaldırıldı." };
}

export async function adminUnenrollAll(userId: number): Promise<ActionResult> {
  await requireAdmin();
  const list = await db.select({ courseId: enrollments.courseId }).from(enrollments).where(eq(enrollments.userId, userId));
  for (const e of list) await unenrollUser(userId, e.courseId);
  revalidatePath("/admin/ogrenciler");
  return { ok: true, message: "Tüm kayıtlar kaldırıldı." };
}

// ---------- Siparişler ----------

export async function setOrderStatus(orderId: number, status: "paid" | "cancelled" | "refunded" | "pending"): Promise<ActionResult> {
  await requireAdmin();
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o) return { ok: false, error: "Sipariş yok." };
  if (status === "paid") {
    await fulfillOrder(orderId);
  } else {
    await db.update(orders).set({ status }).where(eq(orders.id, orderId));
    if (status === "cancelled" || status === "refunded") {
      for (const item of o.items) {
        const [e] = await db.select().from(enrollments).where(and(eq(enrollments.userId, o.userId), eq(enrollments.courseId, item.courseId), eq(enrollments.orderId, o.id))).limit(1);
        if (e) await unenrollUser(o.userId, item.courseId);
      }
    }
  }
  revalidatePath("/admin/siparisler");
  return { ok: true, message: "Sipariş güncellendi." };
}

export async function updateOrderPeriod(orderId: number, courseId: number, periodId: number | null): Promise<ActionResult> {
  await requireAdmin();
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o) return { ok: false, error: "Sipariş yok." };
  const items = o.items.map((i) => (i.courseId === courseId ? { ...i, periodId } : i));
  await db.update(orders).set({ items }).where(eq(orders.id, orderId));
  if (o.status === "paid") {
    await unenrollUser(o.userId, courseId);
    await enrollUser({ userId: o.userId, courseId, orderId: o.id, periodId, sendWelcome: false });
  }
  revalidatePath("/admin/siparisler");
  return { ok: true, message: "Dönem güncellendi." };
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

export async function saveSurveySchema(schema: SurveySchema, bump: boolean, required: boolean): Promise<ActionResult> {
  await requireAdmin();
  const { getRawSetting } = await import("@/lib/settings");
  const { DEFAULT_SURVEY } = await import("@/lib/survey");
  const current = await getRawSetting<SurveySchema>("survey_schema", DEFAULT_SURVEY);
  const seen = new Set<string>();
  const questions = schema.questions.filter((q) => { const k = q.key.trim(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  if (questions.length === 0) return { ok: false, error: "En az bir soru olmalı." };
  const newKeys = questions.some((q) => !current.questions.some((c) => c.key === q.key));
  const version = bump || newKeys ? current.version + 1 : current.version;
  const next: SurveySchema = { ...schema, key: current.key, version, questions };
  await setRawSetting("survey_schema", next);
  await setSetting("panel", { surveyRequired: required });
  if (version !== current.version) {
    const ids = (await db.select({ id: users.id }).from(users).where(and(eq(users.role, "student"), sql`${users.surveyVersion} > 0`))).map((r) => r.id);
    await db.update(users).set({ surveySkipped: false }).where(eq(users.role, "student"));
    await notifyUsers(ids, { title: "📋 Anketinde yeni sorular var", body: schema.title, url: "/panel/anket", tag: `survey-${version}` });
  }
  revalidatePath("/admin/anketler"); revalidatePath("/panel");
  return { ok: true, message: `Kaydedildi (sürüm ${version}).` };
}

export async function resetUserSurvey(userId: number): Promise<ActionResult> {
  await requireAdmin();
  await db.update(users).set({ surveyVersion: 0, surveySkipped: false }).where(eq(users.id, userId));
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

export async function createGeneralCoupon(input: { code: string; percent: number; courseId: number; usageLimit: number; expiryDays?: number }): Promise<ActionResult> {
  await requireAdmin();
  const code = input.code.trim().toUpperCase();
  if (!code || input.percent < 1 || input.percent > 100) return { ok: false, error: "Kod ve 1-100 arası yüzde gerekli." };
  const [ex] = await db.select({ id: coupons.id }).from(coupons).where(eq(coupons.code, code)).limit(1);
  if (ex) return { ok: false, error: "Bu kod zaten var." };
  await db.insert(coupons).values({ code, percent: input.percent, courseId: input.courseId > 0 ? input.courseId : null, usageLimit: input.usageLimit, expiresAt: input.expiryDays ? new Date(Date.now() + input.expiryDays * 86400000) : null });
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
