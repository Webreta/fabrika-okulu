"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { routes, routeSteps, courses } from "@/db/schema";
import { isUniqueViolation, isForeignKeyViolation } from "@/lib/db-errors";
import { LIMITS, tooLong, firstError } from "@/lib/limits";
import { requireAdmin } from "@/lib/auth/session";
import { slugify } from "@/lib/uploads";
import type { ActionResult } from "@/app/actions/teacher";

export type RouteInput = {
  id?: number;
  name: string;
  description: string;
  goal: string;
  active: boolean;
  steps: { courseId: number; note: string }[];
};

function revalidate() {
  revalidatePath("/rotam");
  revalidatePath("/admin/rotalar");
}

/** Rota + adımları tek seferde kaydeder (adımlar verilen sırayla yeniden yazılır) */
export async function saveRoute(input: RouteInput): Promise<ActionResult> {
  await requireAdmin();
  const name = String(input.name ?? "").trim();
  const description = String(input.description ?? "").trim();
  const goal = String(input.goal ?? "").trim();
  if (name.length < 2) return { ok: false, error: "Rota adı gerekli." };
  const lenErr = firstError(
    tooLong("Rota adı", name, LIMITS.routeName),
    tooLong("Zirvedeki hedef", goal, LIMITS.routeGoal),
    tooLong("Açıklama", description, LIMITS.routeDesc),
    ...(input.steps ?? []).map((s, i) => tooLong(`${i + 1}. adımın notu`, String(s.note ?? "").trim(), LIMITS.routeNote)),
  );
  if (lenErr) return { ok: false, error: lenErr };
  const steps = (input.steps ?? []).filter((s) => Number.isInteger(s.courseId) && s.courseId > 0);
  // Aynı eğitim iki kez olmasın
  const seen = new Set<number>();
  const uniq = steps.filter((s) => (seen.has(s.courseId) ? false : (seen.add(s.courseId), true)));
  // Silinmiş eğitim adım olarak gelirse kayıt çökmesin
  if (uniq.length) {
    const found = await db.select({ id: courses.id }).from(courses).where(inArray(courses.id, uniq.map((s) => s.courseId)));
    if (found.length !== uniq.length) return { ok: false, error: "Adımlardaki eğitimlerden biri artık yok. Sayfayı yenileyip adımları kontrol et." };
  }

  // Adres (slug) yalnızca İLK kayıtta addan üretilir; ad sonradan değişse de adres aynı kalır (eski bağlantılar kırılmaz)
  const [current] = input.id ? await db.select({ slug: routes.slug }).from(routes).where(eq(routes.id, input.id)).limit(1) : [];
  if (input.id && !current) return { ok: false, error: "Rota bulunamadı (silinmiş olabilir)." };
  const base = slugify(name) || "rota";
  let slug = current?.slug || base;
  if (!current?.slug) {
    for (let i = 2; ; i++) {
      const [ex] = await db.select({ id: routes.id }).from(routes).where(input.id ? and(eq(routes.slug, slug), ne(routes.id, input.id)) : eq(routes.slug, slug)).limit(1);
      if (!ex) break;
      slug = `${base}-${i}`;
    }
  }
  const values = { name, slug, description, goal, active: !!input.active };
  let id = input.id;
  try {
    if (id) {
      const [row] = await db.update(routes).set(values).where(eq(routes.id, id)).returning({ id: routes.id });
      if (!row) return { ok: false, error: "Rota bulunamadı (silinmiş olabilir)." };
    } else {
      const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${routes.sortOrder}), -1)`.mapWith(Number) }).from(routes);
      const [row] = await db.insert(routes).values({ ...values, sortOrder: n + 1 }).returning({ id: routes.id });
      id = row.id;
    }
    await db.delete(routeSteps).where(eq(routeSteps.routeId, id));
    if (uniq.length) await db.insert(routeSteps).values(uniq.map((s, i) => ({ routeId: id!, courseId: s.courseId, note: String(s.note ?? "").trim(), sortOrder: i })));
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "Bu adda (aynı adresle) bir rota zaten var. Tekrar dene ya da farklı bir ad yaz." };
    if (isForeignKeyViolation(e)) return { ok: false, error: "Adımlardaki eğitimlerden biri artık yok. Sayfayı yenileyip adımları kontrol et." };
    throw e;
  }
  revalidate();
  return { ok: true, id, message: "Rota kaydedildi." };
}

export async function deleteRoute(id: number): Promise<ActionResult> {
  await requireAdmin();
  await db.delete(routes).where(eq(routes.id, id));
  revalidate();
  return { ok: true, message: "Rota silindi." };
}

export async function reorderRoutes(ids: number[]): Promise<ActionResult> {
  await requireAdmin();
  for (let i = 0; i < ids.length; i++) await db.update(routes).set({ sortOrder: i }).where(eq(routes.id, ids[i]));
  revalidate();
  return { ok: true };
}
