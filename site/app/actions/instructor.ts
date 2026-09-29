"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { instructors, users, courses } from "@/db/schema";
import { requireTeacher } from "@/lib/auth/session";
import { saveUploadedFile, IMAGE_EXTENSIONS } from "@/lib/uploads";
import type { ActionResult } from "@/app/actions/teacher";
import type { SocialLinks } from "@/db/schema";
import { isUniqueViolation, isForeignKeyViolation } from "@/lib/db-errors";
import { LIMITS, tooLong, firstError, isEmail } from "@/lib/limits";

/**
 * Eğitmen profiliyle bağı kalmayan kullanıcı öğrenci rolüne döner. Yönetici ise, başka bir eğitmen profiline bağlıysa
 * ya da kendi açtığı eğitim varsa rolü değişmez. Oturumu kapanmaz; bir sonraki istekte öğrenci olarak devam eder.
 * Dönüş: "demoted" | "kept" (rol eğitmen kaldı) | "none" (eğitmen değildi)
 */
async function demoteIfOrphan(userId: number): Promise<"demoted" | "kept" | "none"> {
  const [u] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u || u.role !== "teacher") return "none";
  const [other] = await db.select({ id: instructors.id }).from(instructors).where(eq(instructors.userId, userId)).limit(1);
  if (other) return "kept";
  const [own] = await db.select({ id: courses.id }).from(courses).where(eq(courses.authorId, userId)).limit(1);
  if (own) return "kept";
  await db.update(users).set({ role: "student", isSuperTeacher: false }).where(and(eq(users.id, userId), eq(users.role, "teacher")));
  return "demoted";
}

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
  const name = String(input.name ?? "").trim();
  const title = String(input.title ?? "").trim();
  const email = String(input.email ?? "").trim();
  const phone = String(input.phone ?? "").trim();
  const bio = String(input.bio ?? "");
  const photoUrl = String(input.photoUrl ?? "");
  if (!name) return { ok: false, error: "Ad gerekli." };
  if (email && !isEmail(email)) return { ok: false, error: "E-posta adresi geçerli değil." };
  // Sosyal bağlantılar: yalnızca bilinen metin alanları, boşluklar kırpılır
  const socialLinks: SocialLinks = {};
  for (const [k, v] of Object.entries(input.socialLinks ?? {})) {
    if (typeof v === "string" && v.trim()) (socialLinks as Record<string, string>)[k] = v.trim();
  }
  const lenErr = firstError(
    tooLong("Ad Soyad", name, LIMITS.instructorName),
    tooLong("Unvan", title, LIMITS.instructorTitle),
    tooLong("E-posta", email, LIMITS.email),
    tooLong("Telefon", phone, LIMITS.phone),
    tooLong("Biyografi", bio, LIMITS.instructorBio),
    tooLong("Fotoğraf adresi", photoUrl, LIMITS.url),
    ...Object.values(socialLinks as Record<string, string>).map((v) => tooLong("Sosyal medya bağlantısı", v, LIMITS.url)),
  );
  if (lenErr) return { ok: false, error: lenErr };
  const base = { name, title, email, phone, bio, photoUrl, socialLinks };

  try {
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
    // Bağ değişiyorsa önceki bağlı kullanıcı (kayıttan sonra başka bağı kalmadıysa) öğrenci rolüne döner
    const [before] = id ? await db.select({ userId: instructors.userId }).from(instructors).where(eq(instructors.id, id)).limit(1) : [];
    if (full.userId) {
      // Bir kullanıcı tek profile bağlı olabilir: önce diğer profildeki bağ kaldırılır
      await db.update(instructors).set({ userId: null }).where(id ? and(eq(instructors.userId, full.userId), ne(instructors.id, id)) : eq(instructors.userId, full.userId));
    }
    if (id) {
      const [row] = await db.update(instructors).set(full).where(eq(instructors.id, id)).returning({ id: instructors.id });
      if (!row) return { ok: false, error: "Eğitmen profili bulunamadı (silinmiş olabilir)." };
    } else { const [c] = await db.insert(instructors).values(full).returning({ id: instructors.id }); id = c.id; }
    const notes: string[] = [];
    if (full.userId) {
      // Bağlanan kullanıcı eğitmen olur
      const up = await db.update(users).set({ role: "teacher" }).where(and(eq(users.id, full.userId), eq(users.role, "student"))).returning({ id: users.id });
      if (up.length > 0) notes.push("Bağlanan kullanıcı eğitmen rolüne alındı.");
    }
    if (before?.userId && before.userId !== full.userId) {
      const d = await demoteIfOrphan(before.userId);
      if (d === "demoted") notes.push("Önceki bağlı kullanıcı öğrenci rolüne döndü.");
      else if (d === "kept") notes.push("Önceki bağlı kullanıcı eğitmen rolünde kaldı (başka profili ya da kendi eğitimi var).");
    }
    revalidatePath("/admin/egitmenler");
    revalidatePath("/admin/kullanicilar");
    return { ok: true, id, message: notes.join(" ") || undefined };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "Bu kullanıcı başka bir eğitmen profiline bağlı. Tekrar dene." };
    if (isForeignKeyViolation(e)) return { ok: false, error: "Seçilen kullanıcı bulunamadı. Sayfayı yenileyip tekrar dene." };
    throw e;
  }
}

export async function deleteInstructor(id: number): Promise<ActionResult> {
  const user = await requireTeacher();
  if (user.role !== "admin") return { ok: false, error: "Yetki yok." };
  const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(courses).where(eq(courses.instructorId, id));
  if (n > 0) return { ok: false, error: `Bu eğitmen ${n} kursta kullanılıyor. Önce o kurslarda başka bir eğitmen seç.` };
  const [row] = await db.delete(instructors).where(eq(instructors.id, id)).returning({ userId: instructors.userId });
  if (!row) return { ok: false, error: "Eğitmen profili bulunamadı (silinmiş olabilir)." };
  // Profili silinen kullanıcı eğitmen rolünde kalmasın
  const d = row.userId ? await demoteIfOrphan(row.userId) : "none";
  revalidatePath("/admin/egitmenler");
  revalidatePath("/admin/kullanicilar");
  return {
    ok: true,
    message: d === "demoted" ? "Eğitmen profili silindi. Bağlı kullanıcı öğrenci rolüne döndü."
      : d === "kept" ? "Eğitmen profili silindi. Bağlı kullanıcı eğitmen rolünde kaldı (başka profili ya da kendi eğitimi var)."
      : "Eğitmen profili silindi.",
  };
}
