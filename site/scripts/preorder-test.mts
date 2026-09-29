// Erken kayıt testi: fiyat/erişim kuralları, doğrulama, açılış bildirimi. Geçici kullanıcı + eğitim oluşturur, sonunda siler.
// E-posta gitmez: test kullanıcısında "Program" e-postaları kapalıdır, karşılama maili gönderilmez.
// Çalıştır: npx tsx --conditions=react-server scripts/preorder-test.mts
import "dotenv/config";
import { and, eq, like } from "drizzle-orm";
import { db } from "../db";
import { users, courses, enrollments, notifications } from "../db/schema";
import { effectivePrice, hasActiveSale, isPreorder } from "../lib/course-logic";
import { courseInputSchema, saveCourse, type CourseInput } from "../lib/course-save";
import { enrollUser } from "../lib/enroll";
import { playerAccess } from "../lib/player";
import { studentCourses, studentActions } from "../lib/data/student";
import { notifyPreorderOpened, pendingPreorderCourses } from "../lib/preorder";
import type { SessionUser } from "../lib/auth/session";

let fails = 0;
const check = (name: string, ok: boolean, extra = "") => { console.log(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`); if (!ok) fails++; };
const iso = (offsetDays: number) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
if (!admin) throw new Error("Önce seed çalıştır (admin gerekli).");

const stamp = Date.now().toString(36);
const TITLE = `__erken_kayit_test_${stamp}`;
const input = (over: Partial<CourseInput>): CourseInput => ({
  title: TITLE, shortDescription: "", description: "", imageUrl: "", status: "published", isFree: false, price: 1000, salePrice: 0, saleTo: "",
  outcomes: [], requirements: "", target: "", previewVideo: "", level: "all", language: "Türkçe", hasCertificate: false, lifetime: true, buttonType: "cart",
  type: "course", meetingMinutes: 0, meetingLink: "", periods: [],
  modules: [{ title: "M1", lessons: [{ type: "video", title: "D1", videoUrl: "", duration: "05:00", preview: false, description: "", dueDays: 0, dueDate: "", dueTime: "", fileUrl: "", fileName: "", fileMime: "", questions: [], timeLimit: 0, passScore: 0, maxAttempts: 0, shuffleQuestions: false, showCorrectAnswers: true, isGraded: false, maxScore: 100, allowFile: true, allowVoice: true, allowText: true }] }],
  preorder: true, opensAt: iso(10), preorderPrice: 700,
  ...over,
});
const adminOpts = { authorId: admin.id, instructorId: null, locked: false, isAdmin: true };

let userId = 0;
let courseId = 0;
try {
  // ---- 1) Doğrulama
  const bad = (over: Partial<CourseInput>) => !courseInputSchema.safeParse(input(over)).success;
  check("doğrulama: geçerli erken kayıt kabul edilir", courseInputSchema.safeParse(input({})).success);
  check("doğrulama: açılış tarihi zorunlu", bad({ opensAt: "" }));
  check("doğrulama: 'Yakında' ile birlikte olmaz", bad({ comingSoon: true }));
  check("doğrulama: erken kayıt fiyatı normal fiyattan düşük olmalı", bad({ preorderPrice: 1000 }));
  check("doğrulama: online görüşmede kullanılamaz", bad({ type: "meeting" }));

  // ---- 2) Saf kurallar
  const future = { isFree: false, price: "1000", salePrice: "900", saleTo: null, preorder: true, opensAt: iso(10), preorderPrice: "700" };
  check("kural: açılış gelecekteyse erken kayıt sürüyor", isPreorder(future));
  check("kural: erken kayıt fiyatı indirimin önüne geçer", effectivePrice(future) === 700 && hasActiveSale(future));
  check("kural: erken kayıt fiyatı yoksa indirim geçerli", effectivePrice({ ...future, preorderPrice: null }) === 900);
  check("kural: açılış günü geldiyse erken kayıt biter", !isPreorder({ ...future, opensAt: iso(0) }) && effectivePrice({ ...future, opensAt: iso(0) }) === 900);
  check("kural: işaret yoksa tarih tek başına etkisiz", !isPreorder({ ...future, preorder: false }));

  // ---- 3) Kayıt + erişim
  const [u] = await db.insert(users).values({ email: `erken-kayit-test-${stamp}@example.invalid`, firstName: "Erken", lastName: "Test", passwordHash: "x", role: "student", notifyPrefs: { "mail:program": false } }).returning();
  userId = u.id;
  const su: SessionUser = { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, name: "Erken Test", role: "student", isSuperTeacher: false, panelTheme: "", notifyPrefs: u.notifyPrefs, addresses: {} };

  const saved = await saveCourse(input({}), adminOpts);
  courseId = saved.courseId;
  const row = async () => (await db.select().from(courses).where(eq(courses.id, courseId)).limit(1))[0];
  let c = await row();
  check("kaydet: alanlar yazıldı", c.preorder && c.opensAt === iso(10) && Number(c.preorderPrice) === 700 && c.openNotifiedAt === null);
  check("bekleyen eğitimler listesinde", (await pendingPreorderCourses()).get(courseId) === iso(10));

  await enrollUser({ userId, courseId, sendWelcome: false });
  const acc = await playerAccess(su, courseId);
  check("erişim: açılmadan önce kapalı (notopen)", !acc.ok && acc.reason === "notopen" && acc.opensAt === iso(10));
  const accAdmin = await playerAccess({ ...su, id: admin.id, role: "admin" }, courseId);
  check("erişim: yönetici önizleme yapabilir", accAdmin.ok && accAdmin.preview);
  const mine = (await studentCourses(userId)).find((x) => x.id === courseId);
  check("kitaplık: eğitim görünür, açılış tarihi işaretli", !!mine && mine.opensAt === iso(10));
  const act = await studentActions(userId);
  check("gündem: açılış günü eklendi", act.calendar.some((e) => e.type === "opening" && e.courseTitle === TITLE));
  check("açılmadan bildirim gönderilmez", (await notifyPreorderOpened(courseId)) === 0 && (await row()).openNotifiedAt === null);

  // ---- 4) Açılış günü geldi
  await db.update(courses).set({ opensAt: iso(-1) }).where(eq(courses.id, courseId));
  c = await row();
  check("açılış: erken kayıt bitti, fiyat normale döndü", !isPreorder(c) && effectivePrice(c) === 1000);
  const acc2 = await playerAccess(su, courseId);
  check("açılış: öğrenci erişebilir", acc2.ok && !acc2.preview);
  check("açılış: kitaplıkta not kalktı", (await studentCourses(userId)).find((x) => x.id === courseId)?.opensAt === null);
  check("açılış: bildirim 1 öğrenciye gitti", (await notifyPreorderOpened(courseId)) === 1);
  const notes = await db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.tag, `open-${courseId}`)));
  check("açılış: uygulama içi bildirim kaydı", notes.length === 1 && notes[0].title === "Eğitimin açıldı");
  check("açılış: ikinci çağrı tekrar göndermez", (await notifyPreorderOpened(courseId)) === 0);

  // ---- 5) Yönetici tarihi değiştirir / erken açar
  await saveCourse(input({ id: courseId, opensAt: iso(20) }), adminOpts);
  c = await row();
  check("tarih değişti: bildirim yeniden gönderilebilir", c.opensAt === iso(20) && c.openNotifiedAt === null && isPreorder(c));
  await saveCourse(input({ id: courseId, preorder: false, opensAt: "", preorderPrice: 0 }), adminOpts);
  c = await row();
  check("erken açma: kutu kaldırılınca alanlar temizlenir", !c.preorder && c.opensAt === null && c.preorderPrice === null);
  check("erken açma: bekleyen öğrenciye haber verildi", c.openNotifiedAt !== null);

  // ---- 6) Koruma: eğitime başlamış öğrenci kilitlenmez
  await saveCourse(input({ id: courseId, opensAt: iso(15) }), adminOpts);
  await db.update(enrollments).set({ startedAt: new Date() }).where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)));
  const acc3 = await playerAccess(su, courseId);
  check("koruma: başlamış öğrenci erişimini korur", acc3.ok && !acc3.preview);
  check("koruma: kitaplıkta 'aktifleşecek' notu görmez", (await studentCourses(userId)).find((x) => x.id === courseId)?.opensAt === null);
} finally {
  if (courseId) await db.delete(courses).where(eq(courses.id, courseId));
  await db.delete(courses).where(like(courses.title, "__erken_kayit_test_%"));
  if (userId) await db.delete(users).where(eq(users.id, userId));
}

console.log(fails ? `\n${fails} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
process.exit(fails ? 1 : 0);
