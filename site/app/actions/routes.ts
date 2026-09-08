"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { routes, routeSteps } from "@/db/schema";
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
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: "Rota adı gerekli." };
  const steps = input.steps.filter((s) => s.courseId > 0);
  // Aynı eğitim iki kez olmasın
  const seen = new Set<number>();
  const uniq = steps.filter((s) => (seen.has(s.courseId) ? false : (seen.add(s.courseId), true)));

  const base = slugify(name) || "rota";
  let slug = base;
  for (let i = 2; ; i++) {
    const [ex] = await db.select({ id: routes.id }).from(routes).where(input.id ? and(eq(routes.slug, slug), ne(routes.id, input.id)) : eq(routes.slug, slug)).limit(1);
    if (!ex) break;
    slug = `${base}-${i}`;
  }
  const values = { name, slug, description: input.description.trim(), goal: input.goal.trim().slice(0, 80), active: !!input.active };
  let id = input.id;
  if (id) {
    await db.update(routes).set(values).where(eq(routes.id, id));
  } else {
    const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${routes.sortOrder}), -1)`.mapWith(Number) }).from(routes);
    const [row] = await db.insert(routes).values({ ...values, sortOrder: n + 1 }).returning({ id: routes.id });
    id = row.id;
  }
  await db.delete(routeSteps).where(eq(routeSteps.routeId, id));
  if (uniq.length) await db.insert(routeSteps).values(uniq.map((s, i) => ({ routeId: id!, courseId: s.courseId, note: s.note.trim().slice(0, 400), sortOrder: i })));
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
