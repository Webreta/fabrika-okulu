"use server";

import { revalidatePath } from "next/cache";
import { eq, ne, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, courseCategories } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { slugify } from "@/lib/uploads";
import { setCategoryCourses } from "@/lib/data/categories";
import type { ActionResult } from "@/app/actions/teacher";
import { isUniqueViolation, isForeignKeyViolation } from "@/lib/db-errors";
import { LIMITS, tooLong, firstError } from "@/lib/limits";

function revalidateSite() {
  revalidatePath("/", "layout");
  revalidatePath("/admin/kategoriler");
}

/** Kategori ekle/güncelle. Adres (slug) yalnızca İLK kayıtta addan üretilir; ad sonradan değişse de adres aynı kalır (eski bağlantılar kırılmaz). */
export async function saveCategory(input: { id?: number; name: string; description?: string; sortOrder?: number }): Promise<ActionResult> {
  await requireAdmin();
  const name = String(input.name ?? "").trim();
  const description = String(input.description ?? "").trim();
  if (name.length < 2) return { ok: false, error: "Kategori adı gerekli." };
  const lenErr = firstError(tooLong("Kategori adı", name, LIMITS.categoryName), tooLong("Kısa açıklama", description, LIMITS.categoryDesc));
  if (lenErr) return { ok: false, error: lenErr };
  const [current] = input.id ? await db.select({ slug: categories.slug }).from(categories).where(eq(categories.id, input.id)).limit(1) : [];
  if (input.id && !current) return { ok: false, error: "Kategori bulunamadı (silinmiş olabilir)." };
  const base = slugify(name) || "kategori";
  let slug = current?.slug || base;
  // Yeni kategoride (ya da adresi boş eski kayıtta) adres addan üretilir, çakışırsa sayı eklenir
  if (!current?.slug) {
    for (let i = 2; ; i++) {
      const [ex] = await db.select({ id: categories.id }).from(categories).where(input.id ? and(eq(categories.slug, slug), ne(categories.id, input.id)) : eq(categories.slug, slug)).limit(1);
      if (!ex) break;
      slug = `${base}-${i}`;
    }
  }
  const values = { name, slug, description };
  let id = input.id;
  try {
    if (id) {
      // Sıra yalnızca açıkça verildiyse değişir (düzenlemede kategori listenin başına atlamasın)
      const [row] = await db.update(categories).set(input.sortOrder === undefined ? values : { ...values, sortOrder: input.sortOrder }).where(eq(categories.id, id)).returning({ id: categories.id });
      if (!row) return { ok: false, error: "Kategori bulunamadı (silinmiş olabilir)." };
    } else {
      const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${categories.sortOrder}), -1)`.mapWith(Number) }).from(categories);
      const [row] = await db.insert(categories).values({ ...values, sortOrder: input.sortOrder ?? n + 1 }).returning({ id: categories.id });
      id = row.id;
    }
  } catch (e) {
    // Aynı anda aynı adla iki kayıt
    if (isUniqueViolation(e)) return { ok: false, error: "Bu adda (aynı adresle) bir kategori zaten var. Tekrar dene ya da farklı bir ad yaz." };
    throw e;
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
  const ids = [...new Set((courseIds ?? []).map(Number).filter((x) => Number.isInteger(x) && x > 0))];
  try {
    await setCategoryCourses(categoryId, ids);
  } catch (e) {
    if (isForeignKeyViolation(e)) return { ok: false, error: "Kategori ya da seçilen eğitimlerden biri artık yok. Sayfayı yenileyip tekrar dene." };
    throw e;
  }
  revalidateSite();
  return { ok: true, message: "Eğitimler güncellendi." };
}

/** Tek eğitimi kategoriye ekle/çıkar (kurs listesi hızlı işlem) */
export async function toggleCourseCategory(courseId: number, categoryId: number, on: boolean): Promise<ActionResult> {
  await requireAdmin();
  if (on) {
    try {
      await db.insert(courseCategories).values({ courseId, categoryId }).onConflictDoNothing();
    } catch (e) {
      if (isForeignKeyViolation(e)) return { ok: false, error: "Eğitim ya da kategori artık yok. Sayfayı yenile." };
      throw e;
    }
  } else await db.delete(courseCategories).where(and(eq(courseCategories.courseId, courseId), eq(courseCategories.categoryId, categoryId)));
  revalidateSite();
  return { ok: true };
}
