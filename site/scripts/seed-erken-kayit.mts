// İki örnek "Erken kayıt" eğitimi (yayında, açılış tarihi 30 gün sonra, erken kayıt fiyatlı). Başlık varsa atlar; idempotent.
// ogrenci@test.com varsa ilkine erken kayıtlı yapılır (Kitaplığım'da "şu tarihte aktifleşecek" kartını görmek için).
// Çalıştır: npx tsx --conditions=react-server scripts/seed-erken-kayit.mts
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, courses, courseCategories, categories } from "../db/schema";
import { saveCourse, type CourseInput } from "../lib/course-save";
import { enrollUser } from "../lib/enroll";

const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
if (!admin) throw new Error("Önce seed çalıştır (admin gerekli).");
const DEFAULT_COVER = "/img/site/kurs-mulakat.png";

const opens = new Date();
opens.setDate(opens.getDate() + 30);
const opensAt = `${opens.getFullYear()}-${String(opens.getMonth() + 1).padStart(2, "0")}-${String(opens.getDate()).padStart(2, "0")}`;

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
  preorder: true,
  opensAt,
  ...over,
});

const SEEDS: { input: CourseInput; category: string; enrollTestStudent: boolean }[] = [
  {
    category: "esnek-programlar",
    enrollTestStudent: true,
    input: base({
      title: "5S ve Görsel Yönetim",
      shortDescription: "Çalışma alanını düzenle, israfı görünür kıl: 5S adımları ve görsel yönetim panoları.",
      description: "<p>Sahada 5S'i başlatmak ve sürdürmek isteyenler için adım adım uygulama rehberi. Eğitim açılış tarihinde Kitaplığında aktifleşir; erken kayıt olanlar indirimli fiyattan yararlanır.</p>",
      price: 1200,
      preorderPrice: 840,
      outcomes: ["5S adımlarını sahada uygulama", "Görsel yönetim panosu kurma", "Denetim formu ve puanlama", "Sürdürülebilirlik için rutinler"],
      target: "Üretim, bakım ve depo ekipleri; takım liderleri.",
      modules: [
        { title: "Modül 1: 5S'e başlamak", lessons: [lesson({ title: "Ayıkla ve düzenle", duration: "06:30" }), lesson({ title: "Temizle ve standartlaştır", duration: "08:10" })] },
        { title: "Modül 2: Görsel yönetim", lessons: [lesson({ title: "Pano tasarımı", duration: "07:45" })] },
      ],
    }),
  },
  {
    category: "esnek-programlar",
    enrollTestStudent: false,
    input: base({
      title: "İş Güvenliğinde Liderlik",
      shortDescription: "Ekibinde güvenlik kültürünü kurmak için davranış odaklı liderlik araçları.",
      description: "<p>Kural hatırlatmaktan öteye geçip güvenli davranışı alışkanlığa çevirmek isteyen ilk kademe yöneticiler için. Erken kayıt açık; eğitim açılış tarihinde başlar.</p>",
      price: 980,
      preorderPrice: 690,
      outcomes: ["Güvenlik turu ve gözlem", "Ramak kala bildirimi kültürü", "Geri bildirim konuşmaları", "Ekip güvenlik hedefleri"],
      target: "Vardiya amirleri, takım liderleri ve İSG gönüllüleri.",
      modules: [{ title: "Modül 1: Güvenlik kültürü", lessons: [lesson({ title: "Davranış odaklı güvenlik", duration: "07:10" }), lesson({ title: "Gözlem ve geri bildirim", duration: "09:00" })] }],
    }),
  },
];

const [student] = await db.select({ id: users.id }).from(users).where(eq(users.email, "ogrenci@test.com")).limit(1);

for (const s of SEEDS) {
  const [existing] = await db.select({ id: courses.id }).from(courses).where(eq(courses.title, s.input.title)).limit(1);
  if (existing) { console.log(`Var, atlandı: ${s.input.title} (#${existing.id})`); continue; }
  const r = await saveCourse(s.input, { authorId: admin.id, instructorId: null, locked: false, isAdmin: true });
  const [cat] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, s.category)).limit(1);
  if (cat) await db.insert(courseCategories).values({ courseId: r.courseId, categoryId: cat.id }).onConflictDoNothing();
  if (s.enrollTestStudent && student) await enrollUser({ userId: student.id, courseId: r.courseId, sendWelcome: false });
  console.log(`Erken kayıt eğitimi oluşturuldu: #${r.courseId} (${r.slug}), açılış ${opensAt}`);
}
process.exit(0);
