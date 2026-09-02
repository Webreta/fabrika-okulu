"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { courses, documents, meetingAttendance, notifications, periodEnrollments, periods, pushSubscriptions, resumeFiles, users } from "@/db/schema";
import { meetingSessions, canMarkAttended } from "@/lib/meeting";
import { requireUser, getCurrentUser } from "@/lib/auth/session";
import { saveUploadedFile, removeUploadedFile } from "@/lib/uploads";
import { RESUME_EXTENSIONS, RESUME_QUOTA_BYTES, fmtBytes, isResumeKind } from "@/lib/resume-kinds";
import { sendMail, emailTemplate, siteUrl, adminEmails } from "@/lib/mailer";
import { getSetting } from "@/lib/settings";
import { saveSurvey, getSurveyById, completedSurveyKeys } from "@/lib/survey";
import type { FormState } from "@/app/actions/auth";

const DOC_EXT = new Set(["pdf", "jpg", "jpeg", "png", "webp", "doc", "docx"]);

// ---------- Online görüşme: katıldım ----------

export async function markMeetingAttended(courseId: number, periodId: number, sessionIndex: number): Promise<FormState> {
  const user = await requireUser();
  const [c] = await db.select({ type: courses.type, minutes: courses.meetingMinutes }).from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c || c.type !== "meeting") return { error: "Görüşme bulunamadı." };
  const [pe] = await db.select({ p: periods }).from(periodEnrollments).innerJoin(periods, eq(periodEnrollments.periodId, periods.id))
    .where(and(eq(periodEnrollments.userId, user.id), eq(periods.id, periodId), eq(periods.courseId, courseId))).limit(1);
  if (!pe) return { error: "Bu görüşmeye kayıtlı değilsin." };
  const s = meetingSessions(pe.p.schedule ?? [], c.minutes, []).find((x) => x.index === sessionIndex);
  if (!s) return { error: "Oturum bulunamadı." };
  if (!canMarkAttended(s)) return { error: "Görüşme saati henüz geçmedi." };
  await db.insert(meetingAttendance).values({ userId: user.id, courseId, periodId, sessionIndex }).onConflictDoNothing();
  revalidatePath("/panel/egitim"); revalidatePath("/panel/aksiyon"); revalidatePath("/panel/takvim"); revalidatePath(`/kurs-izle/${courseId}`);
  return { ok: "Katılımın kaydedildi." };
}

// ---------- Özgeçmişim (CV + belgeler) ----------

export async function uploadResumeFile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const kind = formData.get("kind");
  if (!isResumeKind(kind)) return { error: "Geçersiz dosya türü." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Bir dosya seçin." };
  const [{ used }] = await db.select({ used: sql<number>`coalesce(sum(${resumeFiles.size}), 0)`.mapWith(Number) }).from(resumeFiles).where(and(eq(resumeFiles.userId, user.id), eq(resumeFiles.kind, kind)));
  if (used + file.size > RESUME_QUOTA_BYTES) {
    return { error: `Bu bölüm için ${fmtBytes(RESUME_QUOTA_BYTES)} alanın var; kalan ${fmtBytes(Math.max(0, RESUME_QUOTA_BYTES - used))}. Önce bir dosya sil.` };
  }
  const up = await saveUploadedFile(file, `ozgecmis/${user.id}`, RESUME_EXTENSIONS, RESUME_QUOTA_BYTES);
  if (!up.ok) return { error: up.error };
  if (!up.publicPath) return { error: "Bir dosya seçin." };
  await db.insert(resumeFiles).values({ userId: user.id, kind, fileUrl: up.publicPath, fileName: up.name ?? "dosya", size: up.size ?? file.size });
  revalidatePath("/panel/ozgecmis");
  return { ok: "Dosya yüklendi." };
}

export async function deleteResumeFile(id: number) {
  const user = await requireUser();
  const [f] = await db.select().from(resumeFiles).where(and(eq(resumeFiles.id, id), eq(resumeFiles.userId, user.id))).limit(1);
  if (!f) return { ok: false as const };
  await removeUploadedFile(f.fileUrl);
  await db.delete(resumeFiles).where(eq(resumeFiles.id, f.id));
  revalidatePath("/panel/ozgecmis");
  return { ok: true as const };
}

export async function uploadDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const up = await saveUploadedFile(formData.get("file"), `belgeler/${user.id}`, DOC_EXT, 10 * 1024 * 1024);
  if (!up.ok) return { error: up.error };
  if (!up.publicPath) return { error: "Bir dosya seçin." };
  const kindLabel = formData.get("kind") === "mezun" ? "Yeni mezun (diploma)" : "Öğrenci belgesi";
  const userNote = String(formData.get("note") ?? "").slice(0, 900);
  const note = userNote ? `${kindLabel} — ${userNote}` : kindLabel;
  await db.insert(documents).values({ userId: user.id, fileUrl: up.publicPath, fileName: up.name ?? "belge", note });

  const smtp = await getSetting("smtp");
  const to = [smtp.documentsEmail, ...(await adminEmails())].filter(Boolean);
  await sendMail({
    type: "document_uploaded",
    to,
    subject: `Yeni belge yüklendi: ${user.name}`,
    html: emailTemplate({
      title: "Yeni belge",
      html: `<p><b>${user.name}</b> (${user.email}) bir belge yükledi.</p><p>Not: ${note}</p>`,
      buttonText: "Belgeleri gör",
      buttonUrl: siteUrl("/admin/belgeler"),
    }),
  });
  revalidatePath("/panel/belge");
  return { ok: "Belgen alındı. İncelendikten sonra kupon kodun burada görünecek." };
}

/**
 * Panel açıkken canlı bildirim yoklaması için son bildirimler.
 * En yeni id'ye göre sıralı; watcher yeni gelenleri masaüstü + köşe bildirimi olarak gösterir.
 */
export async function recentNotifications(): Promise<{
  items: { id: number; title: string; body: string; url: string }[];
  unread: number;
}> {
  const user = await getCurrentUser();
  if (!user) return { items: [], unread: 0 };
  const rows = await db
    .select({ id: notifications.id, title: notifications.title, body: notifications.body, url: notifications.url, read: notifications.read })
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.id))
    .limit(15);
  return {
    items: rows.map((r) => ({ id: r.id, title: r.title, body: r.body, url: r.url })),
    unread: rows.filter((r) => !r.read).length,
  };
}

export async function markNotificationRead(id: number) {
  const user = await getCurrentUser();
  if (!user) return;
  await db.update(notifications).set({ read: true }).where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));
}

export async function deleteNotification(id: number) {
  const user = await getCurrentUser();
  if (!user) return;
  await db.delete(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));
  revalidatePath("/panel/bildirim");
  revalidatePath("/egitmen/bildirim");
}

export async function markAllNotificationsRead() {
  const user = await getCurrentUser();
  if (!user) return;
  await db.update(notifications).set({ read: true }).where(eq(notifications.userId, user.id));
  revalidatePath("/panel/bildirim");
  revalidatePath("/egitmen/bildirim");
}

export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const user = await getCurrentUser();
  if (!user || !sub?.endpoint) return { ok: false };
  await db
    .insert(pushSubscriptions)
    .values({ userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  const user = await getCurrentUser();
  if (!user) return;
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)));
}

export async function submitSurvey(surveyId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const survey = await getSurveyById(surveyId);
  if (!survey || survey.status !== "published") return { error: "Hedef testi bulunamadı." };
  if (!survey.editable && (await completedSurveyKeys(user.id)).has(survey.key)) return { error: "Bu test tek seferlik; cevaplar sonradan değiştirilemez." };
  const raw: Record<string, string | string[]> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("q_")) {
      const key = k.slice(2);
      const val = String(v);
      if (raw[key] !== undefined) {
        raw[key] = Array.isArray(raw[key]) ? [...(raw[key] as string[]), val] : [raw[key] as string, val];
      } else raw[key] = val;
    }
  }
  // checkbox tek seçim de dizi olsun
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("q_") && formData.getAll(k).length > 1) raw[k.slice(2)] = formData.getAll(k).map(String);
  }
  const res = await saveSurvey(user.id, survey, raw);
  if ("error" in res && res.error) return { error: res.error };
  revalidatePath("/panel");
  revalidatePath("/panel/anket");
  return { ok: "Cevapların kaydedildi, teşekkürler!" };
}
