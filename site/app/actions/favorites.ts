"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { toggleFavorite } from "@/lib/favorites";

export type FavoriteState = { fav?: boolean };

/** Kalp düğmesi: giriş yoksa girişe yönlendirir (dönüşte aynı sayfa), varsa favoriye ekler/çıkarır. */
export async function toggleFavoriteAction(_prev: FavoriteState, formData: FormData): Promise<FavoriteState> {
  const courseId = Number(formData.get("courseId"));
  const back = String(formData.get("back") ?? "/kesfet");
  const user = await getCurrentUser();
  if (!user) redirect(`/panel/giris?r=${encodeURIComponent(back)}`);
  if (!courseId) return {};
  const fav = await toggleFavorite(user.id, courseId);
  revalidatePath("/panel/egitim");
  revalidatePath(back);
  return { fav };
}
