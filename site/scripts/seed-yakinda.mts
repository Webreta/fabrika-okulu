// Üç örnek "Yakında" eğitimi (yayında, satış kapalı, talep toplanır). Başlık varsa atlar; idempotent.
// Çalıştır: npx tsx --conditions=react-server scripts/seed-yakinda.mts
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, courses, courseCategories, categories } from "../db/schema";
import { saveCourse, type CourseInput } from "../lib/course-save";

const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
if (!admin) throw new Error("Önce seed çalıştır (admin gerekli).");
const DEFAULT_COVER = "/img/site/kurs-mulakat.png";

const lesson = (over: Partial<CourseInput["modules"][number]["lessons"][number]>): CourseInput["modules"][number]["lessons"][number] => ({
  type: "video", title: "", videoUrl: "", duration: "", preview: false, description: "", dueDays: 0, dueDate: "", dueTime: "",
  fileUrl: "", fileName: "", fileMime: "", questions: [], timeLimit: 0, passScore: 0, maxAttempts: 0,
  shuffleQuestions: false, showCorrectAnswers: true, isGraded: false, maxScore: 100, allowFile: true, allowVoice: true, allowText: true,
  ...over,
});

const base = (over: Partial<CourseInput>): CourseInput => ({
  title: "",
  shortDescription: "",
  description: "",
  imageUrl: DEFAULT_COVER,
  status: "published",
  isFree: false,
  price: 0,
  salePrice: 0,
  saleTo: "",
  outcomes: [],
  requirements: "Ön koşul yok.",
  target: "",
  previewVideo: "",
  level: "all",
  language: "Türkçe",
  hasCertificate: true,
  lifetime: true,
  buttonType: "cart",
  periods: [],
  modules: [],
  comingSoon: true,
  soonShowPrice: false,
  ...over,
});

const SEEDS: { input: CourseInput; category: string }[] = [
  {
    category: "esnek-programlar",
    input: base({
      title: "Vardiya Amirliği: İlk 90 Gün",
      shortDescription: "Operatörlükten vardiya amirliğine geçişte ilk üç ayı yönetmek için pratik yol haritası.",
      description: "<p>Yeni terfi eden ya da terfiye hazırlanan vardiya amirleri için: ekip devralma, vardiya planı, günlük performans takibi ve zor konuşmalar. Eğitim yakında açılacak; <b>açılınca haber ver</b> diyerek yerini ayırt.</p>",
      price: 1450,
      outcomes: ["Vardiya devir teslimini standartlaştırma", "Günlük hedef ve performans takibi", "Ekip içi zor konuşmalar", "İlk 90 gün planı"],
      target: "Yeni vardiya amirleri ve terfi adayı operatörler.",
      modules: [{ title: "Modül 1: Ekibi devralmak", lessons: [lesson({ title: "İlk hafta: gözlem ve güven", duration: "07:00" }), lesson({ title: "Vardiya planı ve devir teslim", duration: "09:20" })] }],
    }),
  },
  {
    category: "takvimli-programlar",
    input: base({
      title: "Problem Çözme Teknikleri: A3 ve 8D",
      shortDescription: "Sahadaki tekrar eden problemleri kök nedenine inerek çözmek için A3 ve 8D uygulamalı atölyesi.",
      description: "<p>Canlı oturumlarla ilerleyen uygulamalı atölye. Kendi sahandan bir problemi alıp A3 raporuna dönüştürürsün. Dönem tarihleri yakında açıklanacak; talep bırakanlara öncelik verilir.</p>",
      price: 2250,
      soonShowPrice: true, // örnek: bu eğitimde fiyat gösterilir
      outcomes: ["A3 düşünme ve rapor yazımı", "8D adımları ve ekip çalışması", "Kök neden araçları: 5 Neden, balık kılçığı", "Kalıcı önlem ve standartlaştırma"],
      target: "Kalite, üretim ve bakım ekiplerinde çalışan mühendis ve teknisyenler.",
      modules: [{ title: "Modül 1: Problemi tanımlamak", lessons: [lesson({ title: "İyi bir problem cümlesi", duration: "06:10" }), lesson({ title: "Veriyle konuşmak", duration: "08:40" })] }],
    }),
  },
  {
    category: "esnek-programlar",
    input: base({
      title: "Excel ile Üretim Raporlama",
      shortDescription: "Vardiya, OEE ve fire raporlarını Excel'de dakikalar içinde hazırla; yöneticiye net tablo sun.",
      description: "<p>Üretim verisini toplayıp anlamlı rapora çevirmek isteyenler için. Pivot tablolar, koşullu biçimlendirme ve otomatik OEE hesabı. Yakında açılıyor.</p>",
      price: 890,
      outcomes: ["Pivot tablo ile vardiya özeti", "OEE hesabı ve trend grafiği", "Fire ve duruş analizi", "Yöneticiye tek sayfa rapor"],
      target: "Üretim planlama, vardiya amiri ve kalite personeli.",
      modules: [{ title: "Modül 1: Veri düzeni", lessons: [lesson({ title: "Ham veriyi tabloya çevirmek", duration: "05:50" }), lesson({ title: "Pivot ile ilk özet", duration: "07:30" })] }],
    }),
  },
];

for (const s of SEEDS) {
  const [existing] = await db.select({ id: courses.id }).from(courses).where(eq(courses.title, s.input.title)).limit(1);
  if (existing) { console.log(`Var, atlandı: ${s.input.title} (#${existing.id})`); continue; }
  const r = await saveCourse(s.input, { authorId: admin.id, instructorId: null, locked: false, isAdmin: true });
  const [cat] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, s.category)).limit(1);
  if (cat) await db.insert(courseCategories).values({ courseId: r.courseId, categoryId: cat.id }).onConflictDoNothing();
  console.log(`Yakında eğitimi oluşturuldu: #${r.courseId} (${r.slug})`);
}
process.exit(0);
