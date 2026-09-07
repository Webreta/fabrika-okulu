"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { joinWaitlist, leaveWaitlist } from "@/lib/waitlist";

/** ok: listede mi (join → true, leave → false); email: haber verilecek adres */
export type WaitlistState = { ok?: boolean; error?: string; email?: string };

/**
 * "Tekrar açılınca haber ver" (intent=join) / "Vazgeç" (intent=leave).
 * Giriş yapan kullanıcıda e-posta hesabından alınır; misafir e-posta (ve isteğe bağlı ad) girer.
 */
export async function waitlistAction(_prev: WaitlistState, formData: FormData): Promise<WaitlistState> {
  const courseId = Number(formData.get("courseId"));
  const intent = String(formData.get("intent") ?? "join");
  const periodRaw = formData.get("periodId");
  const periodId = periodRaw ? Number(periodRaw) : null;
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Geçerli bir e-posta adresi gir." };
  const name = user ? `${user.firstName} ${user.lastName}`.trim() : String(formData.get("name") ?? "").trim();
  await joinWaitlist({ courseId, periodId, userId: user?.id ?? null, email, name });
  revalidatePath(`/program/${c.slug}`);
  return { ok: true, email };
}
