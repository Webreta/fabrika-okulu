"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { toggleFavorite } from "@/lib/favorites";
import { toId } from "@/lib/ids";
import { safeInternalPath } from "@/lib/safe-path";

export type FavoriteState = { fav?: boolean };

/** Kalp düğmesi: giriş yoksa girişe yönlendirir (dönüşte aynı sayfa), varsa favoriye ekler/çıkarır. */
export async function toggleFavoriteAction(_prev: FavoriteState, formData: FormData): Promise<FavoriteState> {
  const courseId = toId(formData.get("courseId"));
  // Dönüş adresi yalnızca site içi yol olabilir
  const back = safeInternalPath(formData.get("back"), "/kesfet");
  const user = await getCurrentUser();
  if (!user) redirect(`/panel/giris?r=${encodeURIComponent(back)}`);
  if (!courseId) return {};
  // Olmayan eğitim favoriye eklenemez (elle gönderilen istek)
  const [c] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c) return {};
  const fav = await toggleFavorite(user.id, courseId);
  revalidatePath("/panel/egitim");
  revalidatePath(back);
  return { fav };
}
