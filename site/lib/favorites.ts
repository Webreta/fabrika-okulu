import "server-only";
import { cache } from "react";
import { and, eq, inArray, desc } from "drizzle-orm";
import { db } from "@/db";
import { courses, enrollments, favorites, users } from "@/db/schema";
import { listCourses } from "@/lib/data/courses";
import { effectivePrice, hasActiveSale } from "@/lib/course-logic";
import { sendMail, emailTemplate, siteUrl } from "@/lib/mailer";
import { notifyUser } from "@/lib/notify";
import { fmtMoney } from "@/lib/format";

/** Kullanıcının favori kurs id'leri (istek başına bir sorgu; CourseCard'lar paylaşır) */
export const myFavoriteIds = cache(async (userId: number): Promise<Set<number>> => {
  const rows = await db.select({ courseId: favorites.courseId }).from(favorites).where(eq(favorites.userId, userId));
  return new Set(rows.map((r) => r.courseId));
});

export async function isFavorite(userId: number, courseId: number) {
  return (await myFavoriteIds(userId)).has(courseId);
}

/** Ekle/çıkar; sonucu (favoride mi) döner */
export async function toggleFavorite(userId: number, courseId: number): Promise<boolean> {
  const [ex] = await db.select({ id: favorites.id }).from(favorites).where(and(eq(favorites.userId, userId), eq(favorites.courseId, courseId))).limit(1);
  if (ex) {
    await db.delete(favorites).where(eq(favorites.id, ex.id));
    return false;
  }
  await db.insert(favorites).values({ userId, courseId }).onConflictDoNothing();
  return true;
}

/** Öğrencinin favori eğitimleri (yayında olanlar; kapalı olanlar da "artık yayında değil" diye listelenir) */
export async function studentFavorites(userId: number) {
  const rows = await db.select({ courseId: favorites.courseId, createdAt: favorites.createdAt }).from(favorites).where(eq(favorites.userId, userId)).orderBy(desc(favorites.createdAt));
  if (rows.length === 0) return [];
  const list = await listCourses({ ids: rows.map((r) => r.courseId) });
  const enrolled = await db.select({ courseId: enrollments.courseId }).from(enrollments).where(and(eq(enrollments.userId, userId), inArray(enrollments.courseId, rows.map((r) => r.courseId))));
  const enrolledIds = new Set(enrolled.map((e) => e.courseId));
  const order = new Map(rows.map((r, i) => [r.courseId, i]));
  return list
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((c) => ({ ...c, onSale: hasActiveSale(c), effective: effectivePrice(c), enrolled: enrolledIds.has(c.id) }));
}

function saleKey(c: { salePrice: string | null; saleTo: string | null }) {
  return c.salePrice ? `${Number(c.salePrice).toFixed(2)}|${c.saleTo ?? ""}` : "";
}

/**
 * Kurs kaydedildikten sonra çağrılır: indirim yeni başladıysa ya da değiştiyse (tutar/bitiş) favorileyenlere
 * uygulama içi bildirim (fav- etiketi, tercihten kapatılabilir) + e-posta (favorite_sale) gönderir.
 * Aynı indirim için ikinci kez göndermez (favorites.notifiedSaleKey); kursa zaten kayıtlı olanlara göndermez.
 */
export async function notifyFavoritesOnSale(courseId: number, before: { isFree: boolean; price: string; salePrice: string | null; saleTo: string | null }): Promise<number> {
  const [c] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c || c.status !== "published" || c.closed || !hasActiveSale(c)) return 0;
  const key = saleKey(c);
  const wasSame = hasActiveSale(before) && saleKey(before) === key;
  if (wasSame) return 0;

  const fans = await db
    .select({ id: favorites.id, userId: favorites.userId, notifiedSaleKey: favorites.notifiedSaleKey, email: users.email, firstName: users.firstName })
    .from(favorites)
    .innerJoin(users, eq(favorites.userId, users.id))
    .where(eq(favorites.courseId, courseId));
  if (fans.length === 0) return 0;
  const enrolled = new Set(
    (await db.select({ userId: enrollments.userId }).from(enrollments).where(and(eq(enrollments.courseId, courseId), inArray(enrollments.userId, fans.map((f) => f.userId))))).map((e) => e.userId)
  );

  const eff = effectivePrice(c);
  const percent = Math.round((1 - eff / Number(c.price)) * 100);
  const until = c.saleTo ? ` İndirim ${c.saleTo.split("-").reverse().join(".")} tarihine kadar geçerli.` : "";
  const url = `/program/${c.slug}`;
  let sent = 0;
  for (const f of fans) {
    if (f.notifiedSaleKey === key || enrolled.has(f.userId)) continue;
    await notifyUser(f.userId, {
      title: `Favori eğitiminde %${percent} indirim`,
      body: `${c.title} · ${fmtMoney(c.price)} yerine ${fmtMoney(eff)}`,
      url,
      tag: `fav-${c.id}`,
    });
    await sendMail({
      type: "favorite_sale",
      to: f.email,
      subject: `${c.title} indirimde: ${fmtMoney(eff)}`,
      html: emailTemplate({
        title: `Favori eğitiminde %${percent} indirim`,
        html: `<p>Merhaba ${f.firstName || ""},</p><p>Favorilerine eklediğin <b>${c.title}</b> eğitimi indirime girdi: <s>${fmtMoney(c.price)}</s> <b>${fmtMoney(eff)}</b>.${until}</p>`,
        buttonText: "Eğitime git",
        buttonUrl: siteUrl(url),
      }),
    });
    await db.update(favorites).set({ notifiedSaleKey: key }).where(eq(favorites.id, f.id));
    sent++;
  }
  return sent;
}
