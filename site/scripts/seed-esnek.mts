// Test amaçlı esnek (dönemsiz, ücretli) eğitim oluşturur ve ogrenci@test.com'u kaydeder.
// Çalıştır: npx tsx --conditions=react-server scripts/seed-esnek.mts
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, courses } from "../db/schema";
import { saveCourse, type CourseInput } from "../lib/course-save";
import { enrollUser } from "../lib/enroll";

const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
const [student] = await db.select().from(users).where(eq(users.email, "ogrenci@test.com")).limit(1);
if (!admin || !student) throw new Error("Önce seed çalıştır (admin ve ogrenci@test.com gerekli).");

const TITLE = "Etkili İletişim ve Sunum Teknikleri";
const [existing] = await db.select({ id: courses.id }).from(courses).where(eq(courses.title, TITLE)).limit(1);
if (existing) {
  console.log(`Kurs zaten var (#${existing.id}); yalnızca kayıt yenileniyor.`);
  await enrollUser({ userId: student.id, courseId: existing.id, sendWelcome: false });
  process.exit(0);
}

const lesson = (over: Partial<CourseInput["modules"][number]["lessons"][number]>): CourseInput["modules"][number]["lessons"][number] => ({
  type: "video", title: "", videoUrl: "", duration: "", preview: false, description: "", dueDays: 0, dueDate: "", dueTime: "",
  fileUrl: "", fileName: "", fileMime: "", questions: [], timeLimit: 0, passScore: 0, maxAttempts: 0,
  shuffleQuestions: false, showCorrectAnswers: true, isGraded: false, maxScore: 100, allowFile: true, allowVoice: true, allowText: true,
  ...over,
});

const input: CourseInput = {
  title: TITLE,
  shortDescription: "Kendi hızında ilerle: net konuşma, güçlü sunum ve ikna becerileri.",
  description: "<p>İş hayatında derdini net anlatmak, toplantıda söz almak ve etkili sunum yapmak için pratik bir program. Esnek yapıdadır; istediğin zaman başlar, kendi hızında bitirirsin.</p>",
  imageUrl: "",
  status: "published",
  isFree: false,
  price: 750,
  salePrice: 0,
  saleTo: "",
  outcomes: ["Dinleyiciye göre mesaj kurgulama", "Sunumda akış ve hikâye kurma", "Zor sorularla başa çıkma", "Beden dili ve ses kullanımı"],
  requirements: "Ön koşul yok.",
  target: "Sunum ve iletişim becerisini geliştirmek isteyen herkes.",
  previewVideo: "",
  level: "all",
  language: "Türkçe",
  hasCertificate: false,
  lifetime: true,
  buttonType: "cart",
  periods: [], // dönem yok → esnek
  modules: [
    {
      title: "Modül 1: İletişimin Temelleri",
      lessons: [
        lesson({ title: "İletişim modeli ve dinleme", videoUrl: "https://www.youtube.com/watch?v=HAnw168huqA", duration: "06:30", preview: true }),
        lesson({ title: "Mesajını netleştir: tek cümle kuralı", videoUrl: "https://www.youtube.com/watch?v=Unzc731iCUY", duration: "08:10" }),
        lesson({
          type: "quiz", title: "Bölüm Sınavı: Temeller", dueDays: 5,
          questions: [
            { qtype: "multiple_choice", text: "Etkin dinlemenin ilk adımı nedir?", points: 2, options: ["Cevabı zihinde hazırlamak", "Karşıdakinin sözünü bitirmesine izin vermek", "Not almamak", "Hemen soru sormak"], correct: 1, explanation: "Etkin dinleme, sözü kesmeden dinleyip anladığını doğrulamakla başlar.", image: "" },
            { qtype: "multiple_choice", text: "\"Tek cümle kuralı\" neyi hedefler?", points: 2, options: ["Sunumu kısaltmayı", "Ana mesajı tek net cümlede toplamayı", "Slayt sayısını azaltmayı", "Soruları engellemeyi"], correct: 1, explanation: "Dinleyicinin aklında kalacak ana mesaj tek ve net bir cümleye sığmalıdır.", image: "" },
            { qtype: "true_false", text: "Beden dili, sözlü mesajla çelişirse dinleyici genellikle beden diline inanır.", points: 1, correct: "true", options: [], explanation: "Sözsüz sinyaller tutarsızlık durumunda daha inandırıcı bulunur.", image: "" },
          ],
        }),
      ],
    },
    {
      title: "Modül 2: Sunum Pratiği",
      lessons: [
        lesson({ title: "Sunum akışı: açılış, gövde, kapanış", videoUrl: "https://www.youtube.com/watch?v=Iwpi1Lm6dFo", duration: "09:45" }),
        lesson({
          type: "quiz", title: "Bölüm Sınavı: Sunum", dueDays: 5,
          questions: [
            { qtype: "multiple_choice", text: "Güçlü bir açılış için en etkili yöntem hangisidir?", points: 2, options: ["Ajandayı okumak", "Özür dileyerek başlamak", "Çarpıcı bir soru ya da hikâyeyle başlamak", "Kendini uzun uzun tanıtmak"], correct: 2, explanation: "Dikkati ilk 30 saniyede yakalayan soru/hikâye açılışları en etkilisidir.", image: "" },
            { qtype: "true_false", text: "Slaytta ne kadar çok metin olursa sunum o kadar etkili olur.", points: 1, correct: "false", options: [], explanation: "Kalabalık slayt dinleyiciyi okumaya zorlar; az metin + görsel daha etkilidir.", image: "" },
          ],
        }),
      ],
    },
  ],
};

const r = await saveCourse(input, { authorId: admin.id, instructorId: null, locked: false, isAdmin: true });
await enrollUser({ userId: student.id, courseId: r.courseId, sendWelcome: false });
const [c] = await db.select({ group: courses.group }).from(courses).where(eq(courses.id, r.courseId)).limit(1);
console.log(`Kurs oluşturuldu: #${r.courseId} (${r.slug}) · grup=${c?.group} · ogrenci@test.com kaydedildi.`);
process.exit(0);
