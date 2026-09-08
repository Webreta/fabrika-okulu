"use server";

import { revalidatePath } from "next/cache";
import { eq, ne, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, courseCategories } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { slugify } from "@/lib/uploads";
import { setCategoryCourses } from "@/lib/data/categories";
import type { ActionResult } from "@/app/actions/teacher";

function revalidateSite() {
  revalidatePath("/", "layout");
  revalidatePath("/admin/kategoriler");
}

/** Kategori ekle/güncelle. Slug addan üretilir, çakışırsa sayı eklenir. */
export async function saveCategory(input: { id?: number; name: string; description?: string; sortOrder?: number }): Promise<ActionResult> {
  await requireAdmin();
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: "Kategori adı gerekli." };
  const base = slugify(name) || "kategori";
  let slug = base;
  for (let i = 2; ; i++) {
    const [ex] = await db.select({ id: categories.id }).from(categories).where(input.id ? and(eq(categories.slug, slug), ne(categories.id, input.id)) : eq(categories.slug, slug)).limit(1);
    if (!ex) break;
    slug = `${base}-${i}`;
  }
  const values = { name, slug, description: (input.description ?? "").trim(), sortOrder: input.sortOrder ?? 0 };
  let id = input.id;
  if (id) {
    await db.update(categories).set(values).where(eq(categories.id, id));
  } else {
    const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${categories.sortOrder}), -1)`.mapWith(Number) }).from(categories);
    const [row] = await db.insert(categories).values({ ...values, sortOrder: input.sortOrder ?? n + 1 }).returning({ id: categories.id });
    id = row.id;
  }
  revalidateSite();
  return { ok: true, id, message: "Kaydedildi." };
}

export async function deleteCategory(id: number): Promise<ActionResult> {
  await requireAdmin();
  await db.delete(categories).where(eq(categories.id, id));
  revalidateSite();
  return { ok: true, message: "Kategori silindi." };
}

/** Sıralama: id listesi verilen sırayla 0..n */
export async function reorderCategories(ids: number[]): Promise<ActionResult> {
  await requireAdmin();
  for (let i = 0; i < ids.length; i++) await db.update(categories).set({ sortOrder: i }).where(eq(categories.id, ids[i]));
  revalidateSite();
  return { ok: true };
}

/** Kategorideki eğitimleri topluca ayarla (dağıtım ekranı) */
export async function assignCategoryCourses(categoryId: number, courseIds: number[]): Promise<ActionResult> {
  await requireAdmin();
  await setCategoryCourses(categoryId, courseIds);
  revalidateSite();
  return { ok: true, message: "Eğitimler güncellendi." };
}

/** Tek eğitimi kategoriye ekle/çıkar (kurs listesi hızlı işlem) */
export async function toggleCourseCategory(courseId: number, categoryId: number, on: boolean): Promise<ActionResult> {
  await requireAdmin();
  if (on) await db.insert(courseCategories).values({ courseId, categoryId }).onConflictDoNothing();
  else await db.delete(courseCategories).where(and(eq(courseCategories.courseId, courseId), eq(courseCategories.categoryId, categoryId)));
  revalidateSite();
  return { ok: true };
}
