"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, notifications, pushSubscriptions, users } from "@/db/schema";
import { requireUser, getCurrentUser } from "@/lib/auth/session";
import { saveUploadedFile } from "@/lib/uploads";
import { sendMail, emailTemplate, siteUrl, adminEmails } from "@/lib/mailer";
import { getSetting } from "@/lib/settings";
import { saveSurvey, getSurveyById } from "@/lib/survey";
import type { FormState } from "@/app/actions/auth";

const DOC_EXT = new Set(["pdf", "jpg", "jpeg", "png", "webp", "doc", "docx"]);

export async function uploadDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const up = await saveUploadedFile(formData.get("file"), `belgeler/${user.id}`, DOC_EXT, 10 * 1024 * 1024);
  if (!up.ok) return { error: up.error };
  if (!up.publicPath) return { error: "Bir dosya seçin." };
  const note = String(formData.get("note") ?? "").slice(0, 1000);
  await db.insert(documents).values({ userId: user.id, fileUrl: up.publicPath, fileName: up.name ?? "belge", note });

  const smtp = await getSetting("smtp");
  const to = [smtp.documentsEmail, ...(await adminEmails())].filter(Boolean);
  await sendMail({
    type: "document_uploaded",
    to,
    subject: `Yeni belge yüklendi: ${user.name}`,
    html: emailTemplate({
      title: "Yeni belge",
      html: `<p><b>${user.name}</b> (${user.email}) bir belge yükledi.</p><p>${note ? `Not: ${note}` : ""}</p>`,
      buttonText: "Belgeleri gör",
      buttonUrl: siteUrl("/admin/belgeler"),
    }),
  });
  revalidatePath("/panel/belge");
  return { ok: "Belgen alındı. İncelendikten sonra kupon kodun burada görünecek." };
}

export async function markNotificationRead(id: number) {
  const user = await getCurrentUser();
  if (!user) return;
  await db.update(notifications).set({ read: true }).where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));
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
  if (!survey || survey.status !== "published") return { error: "Anket bulunamadı." };
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
  return { ok: "Anket kaydedildi, teşekkürler!" };
}
