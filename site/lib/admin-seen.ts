import "server-only";
import { sql, gt, and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notes, enrollments, orders, users, surveyAnswers, issuedCertificates } from "@/db/schema";
import { getRawSetting, setRawSetting } from "@/lib/settings";

// Yönetici menüsündeki "yeni" rozetleri: her bölüm için son görülme zamanı ayar tablosunda tutulur.
export const SEEN_SECTIONS = ["notlar", "ogrenciler", "siparisler", "kullanicilar", "anketler", "sertifikalar"] as const;
export type SeenSection = (typeof SEEN_SECTIONS)[number];

type SeenMap = Partial<Record<SeenSection, string>>;

export async function getSeen(adminId: number): Promise<SeenMap> {
  return getRawSetting<SeenMap>(`admin_seen:${adminId}`, {});
}

export async function markSeen(adminId: number, section: SeenSection) {
  const cur = await getSeen(adminId);
  await setRawSetting(`admin_seen:${adminId}`, { ...cur, [section]: new Date().toISOString() });
}

const count = sql<number>`count(*)`.mapWith(Number);

/** Son görülmeden bu yana eklenen kayıt sayıları */
export async function newCounts(adminId: number) {
  const seen = await getSeen(adminId);
  const since = (k: SeenSection) => new Date(seen[k] ?? "2000-01-01");
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const [notlar, ogrenciler, siparisler, kullanicilar, anketler, sertifikalar] = await Promise.all([
    n(db.select({ n: count }).from(notes).where(gt(notes.createdAt, since("notlar")))),
    n(db.select({ n: count }).from(enrollments).where(gt(enrollments.enrolledAt, since("ogrenciler")))),
    n(db.select({ n: count }).from(orders).where(gt(orders.createdAt, since("siparisler")))),
    n(db.select({ n: count }).from(users).where(and(gt(users.createdAt, since("kullanicilar")), eq(users.role, "student")))),
    n(db.select({ n: sql<number>`count(distinct ${surveyAnswers.userId})`.mapWith(Number) }).from(surveyAnswers).where(gt(surveyAnswers.updatedAt, since("anketler")))),
    n(db.select({ n: count }).from(issuedCertificates).where(gt(issuedCertificates.issuedAt, since("sertifikalar")))),
  ]);
  return { notlar, ogrenciler, siparisler, kullanicilar, anketler, sertifikalar };
}
