"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { courses, modules, periods } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { isId } from "@/lib/format";
import { openModuleNow, setModuleOpening } from "@/lib/module-access";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** Modül ve dönem aynı eğitime ait mi; açılış ayarı yalnızca "hemen açık" olmayan modülde anlamlı */
async function load(moduleId: unknown, periodId: unknown) {
  if (!isId(moduleId) || !isId(periodId)) return null;
  const [m] = await db.select({ id: modules.id, courseId: modules.courseId, unlockMode: modules.unlockMode }).from(modules).where(eq(modules.id, moduleId)).limit(1);
  const [p] = await db.select({ id: periods.id, courseId: periods.courseId }).from(periods).where(eq(periods.id, periodId)).limit(1);
  if (!m || !p || m.courseId !== p.courseId || m.unlockMode === "open") return null;
  const [c] = await db.select({ status: courses.status }).from(courses).where(eq(courses.id, m.courseId)).limit(1);
  return { m, p, published: c?.status === "published" };
}

function refresh(courseId: number) {
  revalidatePath(`/admin/kurslar/detay/${courseId}`);
  revalidatePath(`/egitmen/detay/${courseId}`);
}

/** Yönetici: dönem için modülü şimdi açar; dönemin öğrencilerine bildirim + e-posta gider (yalnızca yayındaki eğitimde) */
export async function openModuleNowAction(moduleId: number, periodId: number): Promise<Result> {
  const user = await requireAdmin();
  const x = await load(moduleId, periodId);
  if (!x) return { ok: false, error: "Modül ya da dönem bulunamadı." };
  const n = await openModuleNow(x.m.id, x.p.id, user.id);
  refresh(x.m.courseId);
  return { ok: true, message: x.published ? (n > 0 ? `Modül açıldı; ${n} öğrenciye haber verildi.` : "Modül açıldı; dönemde kayıtlı öğrenci yok.") : "Modül açıldı (eğitim yayında olmadığı için bildirim gönderilmedi)." };
}

/**
 * Yönetici: dönem için açılış tarihi belirler (datetime-local "YYYY-MM-DDTHH:MM") ya da kaldırır (null).
 * Manuel modülde kaldırmak kapatır; zamanlı modülde göreli kurala dönülür. Saati gelince cron öğrencilere haber verir.
 */
export async function setModuleOpeningAction(moduleId: number, periodId: number, opensAt: string | null): Promise<Result> {
  const user = await requireAdmin();
  const x = await load(moduleId, periodId);
  if (!x) return { ok: false, error: "Modül ya da dönem bulunamadı." };
  let at: Date | null = null;
  if (opensAt !== null) {
    if (typeof opensAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(opensAt)) return { ok: false, error: "Tarih ve saat gerekli." };
    at = new Date(`${opensAt}:00`);
    if (isNaN(at.getTime())) return { ok: false, error: "Geçerli bir tarih değil." };
  }
  await setModuleOpening(x.m.id, x.p.id, at, user.id);
  refresh(x.m.courseId);
  if (!at) return { ok: true, message: x.m.unlockMode === "manual" ? "Açılış geri alındı; modül bu dönem için kapandı." : "Dönem için belirlenen tarih kaldırıldı; göreli kural geçerli." };
  return { ok: true, message: at.getTime() <= Date.now() ? "Tarih geçmişte: modül hemen açıldı; öğrencilere bir sonraki cron turunda haber verilir." : "Açılış tarihi kaydedildi; saati gelince öğrencilere haber verilir." };
}
