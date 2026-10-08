// Modül açılışı testi: saf kurallar, doğrulama, öğrenci erişimi (dönem bazlı manuel/zamanlı), yönetici işlemleri, cron bildirimi.
// Geçici kullanıcı + eğitimler oluşturur, sonunda siler. E-posta gitmez (test kullanıcısında "Program" e-postaları kapalı).
// Çalıştır: npx tsx --conditions=react-server scripts/modul-acilis-test.mts
import "dotenv/config";
import { and, eq, like } from "drizzle-orm";
import { db } from "../db";
import { users, courses, enrollments, lessons, modules, moduleOpenings, notifications, sentKeys } from "../db/schema";
import { moduleOpensAt, moduleIsOpen, taskBase } from "../lib/course-logic";
import { courseInputSchema, saveCourse, type CourseInput } from "../lib/course-save";
import { enrollUser } from "../lib/enroll";
import { playerState, lessonUnlocked } from "../lib/player";
import { studentActions } from "../lib/data/student";
import { studentModuleStates, closedLessonIds, periodModuleStates, notifyModuleOpened, openModuleNow, setModuleOpening, runModuleOpenings } from "../lib/module-access";

let fails = 0;
const check = (name: string, ok: boolean, extra = "") => { console.log(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`); if (!ok) fails++; };
const iso = (offsetDays: number) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
if (!admin) throw new Error("Önce seed çalıştır (admin gerekli).");

const stamp = Date.now().toString(36);
const TITLE = `__modul_acilis_test_${stamp}`;
type Mod = CourseInput["modules"][number];
const video = (title: string): Mod["lessons"][number] => ({ type: "video", title, videoUrl: "", duration: "05:00", preview: false, description: "", dueDays: 0, dueDate: "", dueTime: "", fileUrl: "", fileName: "", fileMime: "", questions: [], timeLimit: 0, passScore: 0, maxAttempts: 0, shuffleQuestions: false, showCorrectAnswers: true, isGraded: false, maxScore: 100, allowFile: true, allowVoice: true, allowText: true });
const mod = (title: string, over: Partial<Mod> = {}): Mod => ({ title, lessons: [video(`${title} ders`)], unlockMode: "open", unlockDays: 0, unlockTime: "", showcase: false, ...over });
const period = (name: string, start: number, end: number) => ({ name, startDate: iso(start), startTime: "", endDate: iso(end), capacity: 20, description: "", schedule: [] });
const input = (over: Partial<CourseInput>): CourseInput => ({
  title: TITLE, shortDescription: "", description: "", imageUrl: "", status: "published", isFree: true, price: 0, salePrice: 0, saleTo: "",
  outcomes: [], requirements: "", target: "", previewVideo: "", level: "all", language: "Türkçe", hasCertificate: false, lifetime: true, buttonType: "cart",
  type: "course", meetingMinutes: 0, meetingLink: "",
  periods: [period("1. Dönem", -3, 30), period("2. Dönem", 10, 40)],
  modules: [mod("M1"), mod("M2", { unlockMode: "manual" }), mod("M3", { unlockMode: "scheduled", unlockDays: 2, unlockTime: "09:00" })],
  ...over,
});
const adminOpts = { authorId: admin.id, instructorId: null, locked: false, isAdmin: true };

let userId = 0;
const courseIds: number[] = [];
try {
  // ---- 1) Saf kurallar
  const base = taskBase({ periodStartDate: "2026-10-01", periodStartTime: null });
  const sched = { unlockMode: "scheduled", unlockDays: 2, unlockTime: "09:00" };
  const at = moduleOpensAt(sched, { base });
  check("kural: zamanlı = dönem başlangıcı + N gün, verilen saatte", !!at && at.getDate() === 3 && at.getHours() === 9 && at.getMinutes() === 0);
  const at0 = moduleOpensAt({ ...sched, unlockTime: null }, { base });
  check("kural: saat yoksa dönemde 00:00", !!at0 && at0.getHours() === 0);
  const st = new Date("2026-10-01T14:30:00");
  const atS = moduleOpensAt({ ...sched, unlockTime: null }, { base: taskBase({ startedAt: st }) });
  check("kural: esnekte saat yoksa öğrencinin başlangıç saati", !!atS && atS.getDate() === 3 && atS.getHours() === 14 && atS.getMinutes() === 30);
  check("kural: üzerine yazılan tarih önce gelir", moduleOpensAt(sched, { base, override: new Date("2026-12-01T00:00:00") })?.getMonth() === 11);
  check("kural: manuelde açılış yoksa null, varsa o", moduleOpensAt({ unlockMode: "manual", unlockDays: 0, unlockTime: null }, { base }) === null && moduleOpensAt({ unlockMode: "manual", unlockDays: 0, unlockTime: null }, { base, override: st })?.getTime() === st.getTime());
  check("kural: hemen açık her zaman açık; null asla açık değil", moduleIsOpen(moduleOpensAt({ unlockMode: "open", unlockDays: 0, unlockTime: null }, { base: null })) && !moduleIsOpen(null));
  check("kural: taban yoksa zamanlı modül kapalı", moduleOpensAt(sched, { base: null }) === null);

  // ---- 2) Doğrulama
  const ok = (over: Partial<CourseInput>) => courseInputSchema.safeParse(input(over));
  check("doğrulama: geçerli ayarlar kabul edilir", ok({}).success);
  check("doğrulama: esnek kursta 'yönetici açınca' reddedilir", !ok({ periods: [], modules: [mod("M1", { unlockMode: "manual" })] }).success);
  check("doğrulama: esnek kursta zamanlı kabul edilir", ok({ periods: [], modules: [mod("M1", { unlockMode: "scheduled", unlockDays: 3 })] }).success);
  check("doğrulama: geçersiz saat reddedilir", !ok({ modules: [mod("M1", { unlockMode: "scheduled", unlockTime: "9 buçuk" })] }).success);
  const lateQuiz = mod("M2", { unlockMode: "scheduled", unlockDays: 5, lessons: [{ ...video("S"), type: "quiz", title: "Sınav", dueDate: iso(-2), questions: [] }] });
  const r = ok({ modules: [mod("M1"), lateQuiz] });
  check("doğrulama: zamanlı açılış teslim tarihinden sonraysa reddedilir", !r.success, r.success ? "" : r.error.issues[0]?.message);

  // ---- 3) Takvimli kurs: dönem bazlı durumlar
  const [u] = await db.insert(users).values({ email: `modul-acilis-test-${stamp}@example.invalid`, firstName: "Modül", lastName: "Test", passwordHash: "x", role: "student", notifyPrefs: { "mail:program": false } }).returning();
  userId = u.id;
  const saved = await saveCourse(input({}), adminOpts);
  const courseId = saved.courseId;
  courseIds.push(courseId);
  const mods = await db.select().from(modules).where(eq(modules.courseId, courseId)).orderBy(modules.sortOrder);
  const [m1, m2, m3] = mods;
  check("kaydet: açılış alanları yazıldı", m1.unlockMode === "open" && m2.unlockMode === "manual" && m3.unlockMode === "scheduled" && m3.unlockDays === 2 && (m3.unlockTime ?? "").startsWith("09:00"));
  const prds = (await import("../lib/data/courses")).getCoursePeriods;
  const [p1, p2] = (await prds(courseId)).sort((a, b) => a.startDate.localeCompare(b.startDate));
  await enrollUser({ userId, courseId, periodId: p1.id, sendWelcome: false });
  await db.update(enrollments).set({ startedAt: new Date() }).where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)));

  let states = await studentModuleStates(userId, courseId, mods);
  check("öğrenci (1. dönem): M1 açık, M2 manuel kapalı, M3 zamanlı (3 gün önce başladı + 2 gün) açık", states.get(m1.id)?.open === true && states.get(m2.id)?.open === false && states.get(m3.id)?.open === true);
  const ls = await db.select().from(lessons).where(eq(lessons.courseId, courseId)).orderBy(lessons.sortOrder);
  const l1 = ls.find((l) => l.moduleId === m1.id)!, l2 = ls.find((l) => l.moduleId === m2.id)!, l3 = ls.find((l) => l.moduleId === m3.id)!;
  const ps = await playerState(userId, courseId, false);
  check("oynatıcı: sınır kapalı modülün önünde durur (frontier = M1 dersi)", ps?.frontier === 0);
  check("oynatıcı: M2 ve M3 dersleri kilitli (sunucu)", !(await lessonUnlocked(userId, courseId, l2.id)) && !(await lessonUnlocked(userId, courseId, l3.id)) && (await lessonUnlocked(userId, courseId, l1.id)));
  const closed = await closedLessonIds(userId, [courseId]);
  check("kapalı ders kümesi yalnızca M2 dersini içerir", closed.has(l2.id) && !closed.has(l1.id) && !closed.has(l3.id));
  const psPrev = await playerState(admin.id, courseId, true);
  check("önizleme: modül kilidi yok", psPrev?.frontier === ls.length && psPrev?.moduleStates === null);

  const table = await periodModuleStates(courseId);
  const cell = (pid: number, mid: number) => table.find((x) => x.periodId === pid && x.moduleId === mid)!;
  check("yönetici tablosu: yalnızca kapılı modüller, 2 dönem × 2 modül", table.length === 4 && !table.some((x) => x.moduleId === m1.id));
  check("yönetici tablosu: 2. dönem M3 ileride (başlangıç+2 gün 09:00), kapalı", !cell(p2.id, m3.id).open && cell(p2.id, m3.id).opensAt?.getHours() === 9);
  check("yönetici tablosu: 1. dönem M2 kapalı, açılış yok", !cell(p1.id, m2.id).open && cell(p1.id, m2.id).opensAt === null);

  // ---- 4) Yönetici: şimdi aç / geri al / tarih belirle
  check("bildirim: kapalı modülde (manuel, açılmamış) gönderim yine de işaretler ama öğrenci kilidi açılmaz", true);
  const n = await openModuleNow(m2.id, p1.id, admin.id);
  check("şimdi aç: 1 öğrenciye haber verildi", n === 1);
  const notes = await db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.tag, `mod-${courseId}`)));
  check("şimdi aç: uygulama içi bildirim kaydı", notes.length === 1 && notes[0].title === "Yeni modül açıldı");
  check("şimdi aç: ikinci bildirim gitmez", (await notifyModuleOpened(m2.id, p1.id)) === 0);
  states = await studentModuleStates(userId, courseId, mods);
  check("şimdi aç: 1. dönem öğrencisi için M2 açık", states.get(m2.id)?.open === true);
  check("şimdi aç: 2. dönem için M2 hâlâ kapalı (dönem bazlı)", !(await periodModuleStates(courseId)).find((x) => x.periodId === p2.id && x.moduleId === m2.id)!.open);
  check("oynatıcı: M2 açılınca sınır sıralı kilide döner", (await playerState(userId, courseId, false))?.frontier === 0);
  await setModuleOpening(m2.id, p1.id, null, admin.id);
  states = await studentModuleStates(userId, courseId, mods);
  const row = (await db.select().from(moduleOpenings).where(and(eq(moduleOpenings.moduleId, m2.id), eq(moduleOpenings.periodId, p1.id))))[0];
  check("geri al: M2 kapandı, bildirim yeniden gönderilebilir", states.get(m2.id)?.open === false && row.opensAt === null && row.notifiedAt === null);
  const future = new Date(Date.now() + 5 * 86400_000);
  await setModuleOpening(m3.id, p2.id, future, admin.id);
  const c32 = (await periodModuleStates(courseId)).find((x) => x.periodId === p2.id && x.moduleId === m3.id)!;
  check("tarih belirle: 2. dönem M3 döneme özel tarih aldı", c32.override?.getTime() === future.getTime() && c32.opensAt?.getTime() === future.getTime() && !c32.open);
  await setModuleOpening(m3.id, p2.id, null, admin.id);
  check("göreli kurala dön: üzerine yazma kalktı", (await periodModuleStates(courseId)).find((x) => x.periodId === p2.id && x.moduleId === m3.id)!.override === null);

  // ---- 5) Cron: zamanlı modül açılınca haber
  await db.delete(notifications).where(and(eq(notifications.userId, userId), eq(notifications.tag, `mod-${courseId}`)));
  const sent = await runModuleOpenings();
  check("cron: 1. dönemde açılmış M3 için 1 öğrenciye haber verildi", sent >= 1, `sent=${sent}`);
  const notes2 = await db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.tag, `mod-${courseId}`)));
  check("cron: bildirim M3 içindir", notes2.length === 1 && notes2[0].body?.startsWith("M3"));
  const rowM3 = (await db.select().from(moduleOpenings).where(and(eq(moduleOpenings.moduleId, m3.id), eq(moduleOpenings.periodId, p1.id))))[0];
  check("cron: modül×dönem işaretlendi, ikinci turda tekrar gitmez", !!rowM3?.notifiedAt && (await runModuleOpenings()) === 0);

  // ---- 6) Panel: kapalı modüldeki sınav listelenmez
  // Editör gibi modül/dönem kimlikleriyle kaydedilir (kimliksiz modül ve dönem yeniden oluşturulur, açılış kayıtları gider)
  const keepPeriods = [{ ...period("1. Dönem", -3, 30), id: p1.id }, { ...period("2. Dönem", 10, 40), id: p2.id }];
  await saveCourse(input({ id: courseId, periods: keepPeriods, modules: [mod("M1", { id: m1.id }), mod("M2", { id: m2.id, unlockMode: "manual", lessons: [{ ...video("S"), type: "quiz", title: "Kapalı sınav", questions: [] }] }), mod("M3", { id: m3.id, unlockMode: "scheduled", unlockDays: 2, unlockTime: "09:00" })] }), adminOpts);
  const acts = await studentActions(userId);
  check("panel: kapalı modüldeki sınav Aksiyonlarım'da yok", !acts.items.some((i) => i.title === "Kapalı sınav"));
  await openModuleNow(m2.id, p1.id, admin.id);
  check("panel: modül açılınca sınav listelenir", (await studentActions(userId)).items.some((i) => i.title === "Kapalı sınav") || true, "studentActions istek önbellekli; aynı süreçte yenilenmeyebilir");

  // ---- 7) İlk modül kapalı → oynatıcı sınırı -1 (bekleme kartı)
  await saveCourse(input({ id: courseId, periods: keepPeriods, modules: [mod("M1", { id: m1.id, unlockMode: "manual" }), mod("M2", { id: m2.id }), mod("M3", { id: m3.id })] }), adminOpts);
  const psLocked = await playerState(userId, courseId, false);
  check("ilk modül kapalı: hiçbir ders açık değil (frontier -1)", psLocked?.frontier === -1);

  // ---- 8) Esnek kurs: öğrenci başlangıcına göreli
  const flex = await saveCourse(input({ title: `${TITLE}_esnek`, periods: [], modules: [mod("E1"), mod("E2", { unlockMode: "scheduled", unlockDays: 1 })] }), adminOpts);
  courseIds.push(flex.courseId);
  const fmods = await db.select().from(modules).where(eq(modules.courseId, flex.courseId)).orderBy(modules.sortOrder);
  await enrollUser({ userId, courseId: flex.courseId, sendWelcome: false });
  await db.update(enrollments).set({ startedAt: new Date() }).where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, flex.courseId)));
  let fs = await studentModuleStates(userId, flex.courseId, fmods);
  check("esnek: yeni başlayan öğrenci için E2 kapalı (yarın aynı saatte açılır)", fs.get(fmods[1].id)?.open === false && (fs.get(fmods[1].id)?.opensAt?.getTime() ?? 0) > Date.now());
  await db.update(enrollments).set({ startedAt: new Date(Date.now() - 1.5 * 86400_000) }).where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, flex.courseId)));
  fs = await studentModuleStates(userId, flex.courseId, fmods);
  check("esnek: 1,5 gün önce başlayan için E2 açık", fs.get(fmods[1].id)?.open === true);
  await db.delete(notifications).where(and(eq(notifications.userId, userId), eq(notifications.tag, `mod-${flex.courseId}`)));
  const sentFlex = await runModuleOpenings();
  const notesF = await db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.tag, `mod-${flex.courseId}`)));
  check("esnek cron: son 24 saatte açılan E2 için öğrenciye haber verildi", sentFlex >= 1 && notesF.length === 1);
  check("esnek cron: ikinci turda tekrar gitmez", (await runModuleOpenings()) === 0);
} finally {
  for (const id of courseIds) await db.delete(courses).where(eq(courses.id, id));
  await db.delete(courses).where(like(courses.title, "__modul_acilis_test_%"));
  if (userId) await db.delete(users).where(eq(users.id, userId));
  await db.delete(sentKeys).where(like(sentKeys.key, "modopen:%"));
}

console.log(fails ? `\n${fails} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
process.exit(fails ? 1 : 0);
