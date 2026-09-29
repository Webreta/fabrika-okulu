"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin, destroyAllSessions } from "@/lib/auth/session";
import { riskyAccount } from "@/lib/health";
import type { ActionResult } from "@/app/actions/teacher";

/**
 * Sistem sağlığı → "Pasif yap": varsayılan parolalı ya da örnek/test hesabını pasifleştirir ve açık oturumlarını kapatır.
 * Hesap silinmez (siparişleri, kayıtları, kursları durur); Kullanıcılar sayfasından yeniden etkinleştirilebilir.
 */
export async function deactivateRiskyAccount(userId: number): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!Number.isInteger(userId) || userId <= 0) return { ok: false, error: "Hesap bulunamadı." };
  if (userId === admin.id) return { ok: false, error: "Kendi hesabını pasif yapamazsın; şifreni değiştir." };
  const target = await riskyAccount(userId);
  if (!target) return { ok: false, error: "Bu hesap varsayılan parolalı ya da örnek hesaplar arasında değil." };
  await db.update(users).set({ active: false, updatedAt: new Date() }).where(eq(users.id, userId));
  await destroyAllSessions(userId);
  revalidatePath("/admin/ayarlar");
  revalidatePath("/admin/kullanicilar");
  return { ok: true, message: `${target.email} pasif yapıldı, açık oturumları kapatıldı.` };
}
