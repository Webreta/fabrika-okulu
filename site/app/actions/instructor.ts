"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { instructors, users, courses } from "@/db/schema";
import { requireTeacher } from "@/lib/auth/session";
import { saveUploadedFile, IMAGE_EXTENSIONS } from "@/lib/uploads";
import type { ActionResult } from "@/app/actions/teacher";
import type { SocialLinks } from "@/db/schema";

export async function uploadInstructorPhoto(formData: FormData) {
  await requireTeacher();
  const up = await saveUploadedFile(formData.get("file"), "egitmen", IMAGE_EXTENSIONS, 5 * 1024 * 1024);
  if (!up.ok) return up;
  return { ok: true as const, url: up.publicPath ?? "" };
}

export async function saveInstructorProfile(input: {
  id?: number; userId?: number | null; name: string; title: string; email: string; phone: string; bio: string; photoUrl: string; socialLinks: SocialLinks; active?: boolean;
}): Promise<ActionResult> {
  const user = await requireTeacher();
  const isAdmin = user.role === "admin";
  if (!input.name.trim()) return { ok: false, error: "Ad gerekli." };
  const base = { name: input.name.trim(), title: input.title, email: input.email, phone: input.phone, bio: input.bio, photoUrl: input.photoUrl, socialLinks: input.socialLinks ?? {} };

  if (!isAdmin) {
    // Eğitmen yalnızca kendi profilini düzenler
    const [mine] = await db.select().from(instructors).where(eq(instructors.userId, user.id)).limit(1);
    if (mine) await db.update(instructors).set(base).where(eq(instructors.id, mine.id));
    else await db.insert(instructors).values({ ...base, userId: user.id });
    revalidatePath("/egitmen/hesap");
    return { ok: true };
  }

  const full = { ...base, userId: input.userId ?? null, active: input.active !== false };
  let id = input.id;
  if (id) await db.update(instructors).set(full).where(eq(instructors.id, id));
  else { const [c] = await db.insert(instructors).values(full).returning({ id: instructors.id }); id = c.id; }
  if (full.userId) {
    // Bir kullanıcı tek profile bağlı olabilir; bağlanan kullanıcı eğitmen olur
    await db.update(instructors).set({ userId: null }).where(and(eq(instructors.userId, full.userId), ne(instructors.id, id)));
    await db.update(users).set({ role: "teacher" }).where(and(eq(users.id, full.userId), eq(users.role, "student")));
  }
  revalidatePath("/admin/egitmenler");
  return { ok: true, id };
}

export async function deleteInstructor(id: number): Promise<ActionResult> {
  const user = await requireTeacher();
  if (user.role !== "admin") return { ok: false, error: "Yetki yok." };
  const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(courses).where(eq(courses.instructorId, id));
  if (n > 0) return { ok: false, error: `Bu eğitmen ${n} kursta kullanılıyor.` };
  await db.delete(instructors).where(eq(instructors.id, id));
  revalidatePath("/admin/egitmenler");
  return { ok: true };
}
