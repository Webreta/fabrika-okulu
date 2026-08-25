import "dotenv/config";
import { readFileSync } from "fs";
import path from "path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { hashPassword } from "../lib/auth/password";

// Kullanım: npm run db:seed  (admin + yasal sayfalar + örnek eğitmen/kurs). Tekrar çalıştırılabilir.

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL yok");
const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema });

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL || "admin@fabrikaokulu.com.tr").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "degistir-beni";
  const name = process.env.SEED_ADMIN_NAME || "Admin";

  // Admin
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!existing) {
    await db.insert(schema.users).values({
      email,
      firstName: name,
      lastName: "",
      passwordHash: await hashPassword(password),
      role: "admin",
      isSuperTeacher: true,
    });
    console.log(`Admin oluşturuldu: ${email}`);
  } else {
    console.log("Admin zaten var, atlandı.");
  }

  // Yasal sayfalar
  const legalPath = path.join(process.cwd(), "db", "seed-data", "legal.json");
  const legal = JSON.parse(readFileSync(legalPath, "utf-8")) as Record<string, { title: string; html: string }>;
  for (const [slug, p] of Object.entries(legal)) {
    await db
      .insert(schema.pages)
      .values({ slug, title: p.title, html: p.html })
      .onConflictDoNothing();
  }
  console.log("Yasal sayfalar eklendi.");

  // Örnek eğitmen
  const [instr] = await db
    .select()
    .from(schema.instructors)
    .where(eq(schema.instructors.email, "info@canerakinci.com"))
    .limit(1);
  let instructorId = instr?.id;
  if (!instructorId) {
    const [teacherUser] = await db
      .insert(schema.users)
      .values({
        email: "egitmen@fabrikaokulu.com.tr",
        firstName: "Caner",
        lastName: "Akıncı",
        passwordHash: await hashPassword("egitmen123"),
        role: "teacher",
        isSuperTeacher: true,
      })
      .onConflictDoNothing()
      .returning({ id: schema.users.id });
    const [row] = await db
      .insert(schema.instructors)
      .values({
        userId: teacherUser?.id ?? null,
        name: "Caner Akıncı",
        title: "Kariyer ve İK Danışmanı",
        email: "info@canerakinci.com",
        photoUrl: "/img/site/egitmen-caner.jpg",
        bio: "20 yılı aşkın üretim, hizmet ve operasyon tecrübesiyle kariyer gelişimi programları hazırlıyor.",
        socialLinks: { linkedin: "https://tr.linkedin.com/in/mcakinci", instagram: "https://www.instagram.com/mumtazcanerakinci/" },
      })
      .returning({ id: schema.instructors.id });
    instructorId = row.id;
    console.log("Örnek eğitmen oluşturuldu (egitmen@fabrikaokulu.com.tr / egitmen123).");
  }

  // Örnek kurslar (mevcut sitedekiler)
  const existingCourses = await db.select({ id: schema.courses.id }).from(schema.courses).limit(1);
  if (existingCourses.length === 0) {
    const adminId = (await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)))[0].id;

    async function addCourse(c: typeof schema.courses.$inferInsert, mods: { title: string; lessons: Partial<typeof schema.lessons.$inferInsert>[] }[]) {
      const [course] = await db.insert(schema.courses).values(c).returning({ id: schema.courses.id });
      let mi = 0;
      for (const m of mods) {
        const [mod] = await db.insert(schema.modules).values({ courseId: course.id, title: m.title, sortOrder: mi++ }).returning({ id: schema.modules.id });
        let li = 0;
        for (const l of m.lessons) {
          const [lesson] = await db
            .insert(schema.lessons)
            .values({ courseId: course.id, moduleId: mod.id, title: l.title ?? "Ders", type: l.type ?? "video", sortOrder: li++, ...l })
            .returning({ id: schema.lessons.id });
          if (l.type === "quiz") {
            const [q] = await db
              .insert(schema.quizzes)
              .values({ courseId: course.id, lessonId: lesson.id, title: l.title ?? "Sınav", extraDays: l.dueDays || null })
              .returning({ id: schema.quizzes.id });
            await db.insert(schema.quizQuestions).values([
              { quizId: q.id, type: "multiple_choice", text: "İşe alım sürecinin ilk adımı nedir?", options: ["İlan yayınlama", "Mülakat", "Teklif", "Oryantasyon"], correct: [0], points: 1, sortOrder: 0 },
              { quizId: q.id, type: "true_false", text: "ATS sistemleri özgeçmişleri anahtar kelimelere göre tarar.", options: ["Doğru", "Yanlış"], correct: "true", points: 1, sortOrder: 1 },
              { quizId: q.id, type: "open_ended", text: "Özgeçmişinde öne çıkarmak istediğin 3 yetkinliği yaz.", options: [], correct: null, points: 2, sortOrder: 2 },
            ]);
          }
          if (l.type === "assign") {
            await db.insert(schema.assignments).values({
              courseId: course.id,
              lessonId: lesson.id,
              title: l.title ?? "Görev",
              description: l.description ?? "",
              extraDays: l.dueDays ?? 0,
              createdBy: adminId,
            });
          }
        }
      }
      return course.id;
    }

    const c1 = await addCourse(
      {
        slug: "basvurunuzu-mulakata-tasiyan-ozgecmis",
        title: "Başvurunuzu Mülakata Taşıyan Özgeçmiş",
        shortDescription: "İşe başvuran yeni mezun ve tecrübeli adaylar, başvurunuzu mülakat aşamasına ulaştıran özgeçmiş ve profili hazırlamayı öğreneceksiniz.",
        description: "<p>Bu programda işe alım sürecinin adımlarını, ATS aday takip sistemlerinin nasıl çalıştığını ve özgeçmiş/profil hazırlarken dikkat edilmesi gerekenleri uygulamalı olarak öğreneceksin.</p>",
        imageUrl: "/img/site/kurs-ozgecmis.jpg",
        status: "published",
        price: "900",
        salePrice: "450",
        group: "takvimli",
        instructorId,
        authorId: adminId,
        outcomes: [
          "İşe alım süreci ve adımları nelerdir?",
          "ATS aday takip sistemi nasıl çalışır?",
          "Özgeçmişte dikkat edilmesi gereken noktalar",
          "Özgeçmiş nasıl hazırlanır?",
          "Profilde dikkat edilmesi gereken noktalar",
          "Profil nasıl hazırlanır?",
          "İş arama ve başvuru sürecinde dikkat edilecek konular",
        ],
        requirements: "Yeterli internet bağlantısı\nWeb tarayıcı\nGeçerli e-mail adresi",
        target: "İş arayan yeni mezunlar ve tecrübeli çalışanlar",
        hasCertificate: true,
        featured: true,
      },
      [
        {
          title: "Temeller",
          lessons: [
            { type: "video", title: "Karşılama ve genel bakış", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", duration: "01:23", preview: true },
            { type: "video", title: "Temel kavramlar", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", duration: "05:10" },
            { type: "quiz", title: "Quiz 1 - İşe alım sürecinin adımları", dueDays: 7 },
            { type: "assign", title: "Görev 1 - Kendi özgeçmişini hazırla", description: "Öğrendiklerinle güncel özgeçmişini hazırla ve PDF olarak yükle.", dueDays: 7 },
            { type: "video", title: "Profil hazırlama", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", duration: "08:00" },
          ],
        },
      ]
    );
    const start = new Date();
    start.setDate(start.getDate() + 14);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const s1 = new Date(start); s1.setDate(s1.getDate() + 1);
    const s2 = new Date(start); s2.setDate(s2.getDate() + 4);
    await db.insert(schema.periods).values({
      courseId: c1,
      name: "Kariyer Yolu Grup 1",
      startDate: iso(start),
      startTime: "19:00",
      endDate: iso(end),
      enrollmentDeadline: iso(new Date(start.getTime() - 86400000)),
      capacity: 90,
      schedule: [
        { date: iso(s1), time: "19:00", title: "Canlı Ders - Özgeçmiş Atölyesi", link: "https://zoom.us/j/000000000" },
        { date: iso(s2), time: "19:00", title: "Canlı Ders - Profil ve Başvuru", link: "https://zoom.us/j/000000000" },
      ],
    });

    await addCourse(
      {
        slug: "kariyer-yolunda-ayrintili-mulakat-teknikleri-ve-star-yontemi",
        title: "Kariyer Yolunda – Ayrıntılı Mülakat Teknikleri ve STAR Yöntemi",
        shortDescription: 'Yetkinliğe dayalı mülakata nasıl hazırlanmalısın? Yetkinliğe dayalı mülakat tekniği der ki, "Geçmiş davranış, gelecek davranışın en iyi göstergesidir."',
        description: "<p>STAR (Situation, Task, Action, Result) yöntemiyle yetkinliğe dayalı mülakat sorularına nasıl yapılandırılmış cevaplar vereceğini öğren.</p>",
        imageUrl: "/img/site/kurs-mulakat.png",
        status: "published",
        isFree: true,
        price: "0",
        group: "ucretsiz",
        instructorId,
        authorId: adminId,
        outcomes: ["Yetkinliğe dayalı mülakat mantığı", "STAR yöntemi ile cevap kurgulama", "Sık sorulan mülakat soruları"],
        requirements: "Yeterli internet bağlantısı",
        target: "Mülakata hazırlanan tüm adaylar",
      },
      [
        {
          title: "Mülakat Teknikleri",
          lessons: [
            { type: "video", title: "Yetkinliğe dayalı mülakat nedir?", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", duration: "06:30", preview: true },
            { type: "video", title: "STAR yöntemi", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", duration: "09:15" },
          ],
        },
      ]
    );
    console.log("Örnek kurslar eklendi.");
  }

  await client.end();
  console.log("Seed tamam.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
