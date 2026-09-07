// Örnek "kontenjanı dolmuş" takvimli eğitim (idempotent: başlık varsa dokunmaz).
// Dönem 1 bitmiş (Haz–Tem 2026, 5/5), Dönem 2 yaklaşan ama dolu (Eki–Kas 2026, 5/5) → program sayfasında
// "Tüm dönemlerin kontenjanı dolu" + "Tekrar açılınca haber ver". Eğitmen editörden Dönem 3 ekleyip kaydedince
// bekleyenlere otomatik e-posta gider. Dolduran öğrenciler: dolu1..5@test.com / ogrenci123 (ogrenci@test.com kayıtlı DEĞİL).
// Çalıştır: npx tsx --conditions=react-server scripts/seed-dolu.mts  (prod: start.sh her açılışta çağırır)
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, courses, instructors, periods } from "../db/schema";
import { saveCourse, type CourseInput } from "../lib/course-save";
import { enrollUser } from "../lib/enroll";
import { hashPassword } from "../lib/auth/password";

const TITLE = "Yalın Üretim ve Kaizen Uygulamaları";
const COVER = "/img/site/kurs-mulakat.png";
const CAPACITY = 5;

const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
if (!admin) throw new Error("Önce seed çalıştır (admin gerekli).");
const [existing] = await db.select({ id: courses.id }).from(courses).where(eq(courses.title, TITLE)).limit(1);
if (existing) {
  console.log(`Var, atlandı: ${TITLE} (#${existing.id})`);
  process.exit(0);
}

// Örnek eğitmenin profili (varsa) kursa atanır → eğitmen panelinde görünür
const [teacher] = await db.select().from(users).where(eq(users.email, "egitmen@fabrikaokulu.com.tr")).limit(1);
const [prof] = teacher ? await db.select({ id: instructors.id }).from(instructors).where(eq(instructors.userId, teacher.id)).limit(1) : [];

const lesson = (over: Partial<CourseInput["modules"][number]["lessons"][number]>): CourseInput["modules"][number]["lessons"][number] => ({
  type: "video", title: "", videoUrl: "", duration: "", preview: false, description: "", dueDays: 0, dueDate: "", dueTime: "",
  fileUrl: "", fileName: "", fileMime: "", questions: [], timeLimit: 0, passScore: 0, maxAttempts: 0,
  shuffleQuestions: false, showCorrectAnswers: true, isGraded: false, maxScore: 100, allowFile: true, allowVoice: true, allowText: true,
  ...over,
});

const input: CourseInput = {
  title: TITLE,
  shortDescription: "Atölyede israfı azalt, akışı hızlandır: 5S, kaizen ve değer akışı haritalama ile uygulamalı yalın üretim.",
  description: "<p>Üretim sahasında israfı görmeyi, küçük ama sürekli iyileştirmelerle (kaizen) verimliliği artırmayı öğreten 6 haftalık takvimli program. Canlı oturumlar, saha uygulaması ve haftalık görevlerle ilerler.</p>",
  imageUrl: COVER,
  status: "published",
  isFree: false,
  price: 1250,
  salePrice: 0,
  saleTo: "",
  outcomes: ["7 israf türünü sahada tespit etme", "5S ile çalışma alanı düzenleme", "Değer akışı haritası çıkarma", "Kaizen etkinliği planlama ve yürütme"],
  requirements: "Üretim ortamında çalışıyor olmak yeterlidir; ön bilgi gerekmez.",
  target: "Üretim operatörleri, takım liderleri, vardiya amirleri ve kalite ekipleri.",
  previewVideo: "",
  level: "all",
  language: "Türkçe",
  hasCertificate: true,
  lifetime: false,
  buttonType: "cart",
  type: "course",
  meetingMinutes: 0,
  meetingLink: "",
  periods: [
    {
      name: "Dönem 1 (Haziran 2026)", startDate: "2026-06-01", startTime: "19:00", endDate: "2026-07-10", capacity: CAPACITY,
      description: "Tamamlandı.",
      schedule: [
        { date: "2026-06-01", time: "19:00", title: "Açılış: Yalın düşünce ve 7 israf", link: "", notes: "" },
        { date: "2026-06-15", time: "19:00", title: "5S saha uygulaması", link: "", notes: "" },
        { date: "2026-07-06", time: "19:00", title: "Kaizen sunumları ve kapanış", link: "", notes: "" },
      ],
    },
    {
      name: "Dönem 2 (Ekim 2026)", startDate: "2026-10-05", startTime: "19:00", endDate: "2026-11-13", capacity: CAPACITY,
      description: "Pazartesi akşamları canlı oturum, hafta içi saha görevi.",
      schedule: [
        { date: "2026-10-05", time: "19:00", title: "Açılış: Yalın düşünce ve 7 israf", link: "", notes: "" },
        { date: "2026-10-19", time: "19:00", title: "5S saha uygulaması", link: "", notes: "" },
        { date: "2026-11-09", time: "19:00", title: "Kaizen sunumları ve kapanış", link: "", notes: "" },
      ],
    },
  ],
  modules: [
    {
      title: "Modül 1: Yalın Düşünce",
      lessons: [
        lesson({ title: "Yalın üretim nedir, neden önemli?", videoUrl: "https://www.youtube.com/watch?v=HAnw168huqA", duration: "07:20", preview: true }),
        lesson({ title: "7 israf türü ve sahada örnekleri", videoUrl: "https://www.youtube.com/watch?v=Unzc731iCUY", duration: "09:05" }),
        lesson({
          type: "quiz", title: "Bölüm Sınavı: İsraf Türleri", dueDate: "2026-10-18", dueTime: "23:59",
          questions: [
            { qtype: "multiple_choice", text: "Aşağıdakilerden hangisi 7 israf türünden biri DEĞİLDİR?", points: 2, options: ["Fazla üretim", "Bekleme", "Standart iş", "Gereksiz taşıma"], correct: 2, explanation: "Standart iş bir yalın araçtır, israf değildir.", image: "" },
            { qtype: "true_false", text: "Stok fazlası bir israf türüdür.", points: 1, correct: "true", options: [], explanation: "Fazla stok sermayeyi bağlar ve sorunları gizler.", image: "" },
          ],
        }),
      ],
    },
    {
      title: "Modül 2: 5S ve Kaizen",
      lessons: [
        lesson({ title: "5S adımları: Ayıkla, Düzenle, Temizle, Standartlaştır, Sürdür", videoUrl: "https://www.youtube.com/watch?v=Iwpi1Lm6dFo", duration: "10:40" }),
        lesson({ type: "assign", title: "Saha görevi: Çalışma alanında 5S öncesi/sonrası fotoğraf ve kısa rapor", dueDate: "2026-11-01", dueTime: "23:59", isGraded: true, maxScore: 100, description: "Kendi çalışma alanında 5S uygula; öncesi/sonrası fotoğraf ekle ve 5 cümlelik değerlendirme yaz." }),
      ],
    },
  ],
};

const r = await saveCourse(input, { authorId: admin.id, instructorId: prof?.id ?? null, locked: false, isAdmin: true });
const [c] = await db.select().from(courses).where(eq(courses.id, r.courseId)).limit(1);
console.log(`Oluşturuldu: ${TITLE} (#${r.courseId}, /program/${r.slug}) · grup=${c?.group}`);

// Dönemleri doldur: dolu1..5@test.com her iki döneme kayıtlı (kurs kaydı tek, dönem kaydı iki)
const periodRows = await db.select().from(periods).where(eq(periods.courseId, r.courseId));
const NAMES = [["Ayşe", "Demir"], ["Mehmet", "Kaya"], ["Zeynep", "Çelik"], ["Ali", "Şahin"], ["Elif", "Yıldız"]];
for (let i = 0; i < CAPACITY; i++) {
  const email = `dolu${i + 1}@test.com`;
  let [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u) {
    [u] = await db.insert(users).values({ email, firstName: NAMES[i][0], lastName: NAMES[i][1], passwordHash: await hashPassword("ogrenci123"), role: "student" }).returning();
  }
  for (const p of periodRows) await enrollUser({ userId: u.id, courseId: r.courseId, orderId: 0, periodId: p.id, sendWelcome: false });
}
for (const p of periodRows) console.log(`  ${p.name}: ${CAPACITY}/${p.capacity} dolu`);
process.exit(0);
