"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { courses, periods } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { joinWaitlist, leaveWaitlist } from "@/lib/waitlist";
import { toId } from "@/lib/ids";

/** ok: listede mi (join → true, leave → false); email: haber verilecek adres */
export type WaitlistState = { ok?: boolean; error?: string; email?: string };

/**
 * "Tekrar açılınca haber ver" (intent=join) / "Vazgeç" (intent=leave).
 * Giriş yapan kullanıcıda e-posta hesabından alınır; misafir e-posta (ve isteğe bağlı ad) girer.
 */
export async function waitlistAction(_prev: WaitlistState, formData: FormData): Promise<WaitlistState> {
  // Elle oynanmış (sayı olmayan) kimlik sorguya gitmez
  const courseId = toId(formData.get("courseId"));
  if (!courseId) return { error: "Program bulunamadı." };
  const intent = String(formData.get("intent") ?? "join");
  let periodId = toId(formData.get("periodId"));
  // Dönem bu eğitime ait değilse (elle oynanmış) dönemsiz kaydedilir
  if (periodId) {
    const [p] = await db.select({ id: periods.id }).from(periods).where(and(eq(periods.id, periodId), eq(periods.courseId, courseId))).limit(1);
    if (!p) periodId = null;
  }
  const [c] = await db.select({ id: courses.id, slug: courses.slug, status: courses.status }).from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c || c.status !== "published") return { error: "Program bulunamadı." };
  const user = await getCurrentUser();

  if (intent === "leave") {
    if (!user) return { error: "Giriş yapmalısın." };
    await leaveWaitlist(courseId, user.email);
    revalidatePath(`/program/${c.slug}`);
    return { ok: false };
  }

  const email = (user?.email ?? String(formData.get("email") ?? "")).trim().toLowerCase();
  if (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Geçerli bir e-posta adresi gir." };
  const name = user ? `${user.firstName} ${user.lastName}`.trim() : String(formData.get("name") ?? "").trim().slice(0, 120);
  await joinWaitlist({ courseId, periodId, userId: user?.id ?? null, email, name });
  revalidatePath(`/program/${c.slug}`);
  return { ok: true, email };
}
