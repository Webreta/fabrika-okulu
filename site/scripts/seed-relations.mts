// Test: kurs 11'den iki kurs klonlar, yayına alır ve ilişki tanımlar.
// Çalıştır: npx tsx --conditions=react-server scripts/seed-relations.mts
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { courses, courseRelations } from "../db/schema";
import { duplicateCourse } from "../lib/course-save";

const mk = async (title: string, slug: string, price: string) => {
  const [ex] = await db.select({ id: courses.id }).from(courses).where(eq(courses.slug, slug)).limit(1);
  if (ex) return ex.id;
  const id = await duplicateCourse(11);
  if (!id) throw new Error("klonlanamadı");
  await db.update(courses).set({ title, slug, status: "published", price, salePrice: null, closed: false }).where(eq(courses.id, id));
  return id;
};

const a = await mk("İleri Sunum: Sahne Hakimiyeti", "ileri-sunum-sahne-hakimiyeti", "990.00");
const b = await mk("Zor İnsanlarla İletişim", "zor-insanlarla-iletisim", "650.00");

// Etkili İletişim (11) bitirilince → A kursu %30 indirimle önerilir
await db.insert(courseRelations).values({ courseId: 11, relatedCourseId: a, trigger: "completed", discountPercent: 30, note: "" }).onConflictDoNothing();
// Etkili İletişim satın alındığı için → B kursu indirimsiz önerilir
await db.insert(courseRelations).values({ courseId: 11, relatedCourseId: b, trigger: "purchased", discountPercent: 0, note: "" }).onConflictDoNothing();

console.log(`Kurslar: A=#${a}, B=#${b} · ilişkiler tanımlandı.`);
process.exit(0);
