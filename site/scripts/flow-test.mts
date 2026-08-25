// İş akışı testi (server action'lar olmadan, lib katmanı üzerinden):
// kurs kaydet → öğrenci kaydet → ilerleme/kilit → sınav puanlama mantığı → sertifika koşulu → cron.
// Çalıştır: npx tsx --conditions=react-server scripts/flow-test.ts
import "dotenv/config";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { users, courses, enrollments, quizzes, quizQuestions, quizAttempts, progress, lessons, assignments, assignmentSubmissions } from "../db/schema";
import { saveCourse, duplicateCourse } from "../lib/course-save";
import { enrollUser, unenrollUser } from "../lib/enroll";
import { courseProgress, studentActions, studentTaskBase } from "../lib/data/student";
import { computeFrontier, taskDue } from "../lib/course-logic";
import { getCourseFull } from "../lib/data/courses";
import { runFrequent, runDaily } from "../lib/cron";

let fails = 0;
const check = (name: string, ok: boolean, extra = "") => { console.log(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`); if (!ok) fails++; };

const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
const [student] = await db.select().from(users).where(eq(users.email, "ogrenci@test.com")).limit(1);
if (!admin || !student) throw new Error("önce seed + smoke çalıştır");

// 1) Kurs oluştur (müfredat + sınav + görev + dönem)
const start = new Date(); start.setDate(start.getDate() + 3);
const end = new Date(start); end.setDate(end.getDate() + 5);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const saved = await saveCourse(
  {
    title: "Akış Testi Kursu", shortDescription: "test", description: "<p>test</p>", imageUrl: "", status: "published", isFree: false, price: 500, salePrice: 250, saleTo: "",
    outcomes: ["a", "b"], requirements: "", target: "", previewVideo: "", level: "all", language: "Türkçe", hasCertificate: true, lifetime: true, buttonType: "cart",
    modules: [
      { title: "M1", lessons: [
        { type: "video", title: "V1", videoUrl: "https://youtu.be/abc123def45", duration: "2:5", preview: true, description: "", dueDays: 0, fileUrl: "", fileName: "", fileMime: "", questions: [], timeLimit: 0, passScore: 0, maxAttempts: 1 },
        { type: "quiz", title: "Q1", videoUrl: "", duration: "", preview: false, description: "", dueDays: 3, fileUrl: "", fileName: "", fileMime: "", timeLimit: 10, passScore: 50, maxAttempts: 2,
          questions: [
            { qtype: "multiple_choice", text: "2+2?", points: 2, options: ["3", "4", "5"], correct: 1, explanation: "" },
            { qtype: "true_false", text: "Dünya yuvarlak", points: 1, options: [], correct: "true", explanation: "" },
          ] },
        { type: "assign", title: "G1", videoUrl: "", duration: "", preview: false, description: "yap", dueDays: 2, fileUrl: "", fileName: "", fileMime: "", questions: [], timeLimit: 0, passScore: 0, maxAttempts: 1 },
        { type: "file", title: "F1", videoUrl: "", duration: "", preview: false, description: "", dueDays: 0, fileUrl: "x.pdf", fileName: "x.pdf", fileMime: "application/pdf", questions: [], timeLimit: 0, passScore: 0, maxAttempts: 1 },
      ] },
    ],
    periods: [{ name: "D1", startDate: iso(start), startTime: "10:00", endDate: iso(end), capacity: 5, description: "", schedule: [{ date: iso(start), time: "10:00", title: "Açılış", link: "https://zoom.us/x", notes: "" }] }],
  },
  { authorId: admin.id, instructorId: null, locked: false, isAdmin: true }
);
const full = (await getCourseFull(saved.courseId))!;
check("kurs kaydedildi", !!full && full.slug === "akis-testi-kursu", full.slug);
check("grup takvimli", full.group === "takvimli", full.group);
check("4 ders, süre normalize", full.flatLessons.length === 4 && full.flatLessons[0].duration === "02:05", full.flatLessons[0].duration);
check("ilerleme sayacı dosyayı saymaz", full.stats.lessons === 3);
const [qz] = await db.select().from(quizzes).where(eq(quizzes.courseId, full.id));
const qs = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, qz.id));
check("sınav + 2 soru senkron", !!qz && qs.length === 2 && qz.passScore === 50 && qz.extraDays === 3);
const [asg] = await db.select().from(assignments).where(eq(assignments.courseId, full.id));
check("görev senkron", !!asg && asg.extraDays === 2);

// 2) Yeniden kaydet: soru güncelle, bir dersi sil — id'ler korunmalı
const again = await saveCourse(
  { ...(await import("../lib/course-editor-data")).EMPTY_COURSE, id: full.id, title: full.title, status: "published", price: 500,
    modules: [{ id: full.modules[0].id, title: "M1", lessons: [
      { id: full.flatLessons[0].id, type: "video", title: "V1 yeni", videoUrl: "", duration: "3:00", preview: false, description: "", dueDays: 0, fileUrl: "", fileName: "", fileMime: "", questions: [], timeLimit: 0, passScore: 0, maxAttempts: 1 },
      { id: full.flatLessons[1].id, type: "quiz", title: "Q1", videoUrl: "", duration: "", preview: false, description: "", dueDays: 3, fileUrl: "", fileName: "", fileMime: "", timeLimit: 10, passScore: 50, maxAttempts: 2,
        questions: [{ id: qs[0].id, qtype: "multiple_choice", text: "2+2 = ?", points: 2, options: ["3", "4", "5"], correct: 1, explanation: "" }] },
      { id: full.flatLessons[2].id, type: "assign", title: "G1", videoUrl: "", duration: "", preview: false, description: "yap", dueDays: 2, fileUrl: "", fileName: "", fileMime: "", questions: [], timeLimit: 0, passScore: 0, maxAttempts: 1 },
    ] }],
    periods: [] },
  { authorId: admin.id, instructorId: null, locked: false, isAdmin: true }
);
const full2 = (await getCourseFull(again.courseId))!;
const qs2 = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, qz.id));
check("ders id'leri korundu, dosya silindi", full2.flatLessons.length === 3 && full2.flatLessons[0].id === full.flatLessons[0].id && full2.flatLessons[0].title === "V1 yeni");
check("soru güncellendi, diğeri silindi", qs2.length === 1 && qs2[0].id === qs[0].id && qs2[0].text === "2+2 = ?");
check("dönem silindi (kayıt yoktu) → grup esnek", full2.periods.length === 0 && full2.group === "esnek");

// 3) Kilitli (eğitmen) kaydetme müfredatı değiştirmemeli
await saveCourse({ ...(await import("../lib/course-editor-data")).EMPTY_COURSE, id: full.id, title: "Kilitli başlık", status: "published", price: 500, modules: [], periods: [] }, { authorId: admin.id, instructorId: null, locked: true, isAdmin: false });
const full3 = (await getCourseFull(full.id))!;
check("kilitli kayıt müfredatı korur", full3.flatLessons.length === 3 && full3.title === "Kilitli başlık");

// 4) Kayıt + ilerleme + sıralı kilit
await enrollUser({ userId: student.id, courseId: full.id, orderId: 0, sendWelcome: false });
const [en] = await db.select().from(enrollments).where(and(eq(enrollments.userId, student.id), eq(enrollments.courseId, full.id)));
check("kayıt oluştu", !!en && en.status === "active");
let p = await courseProgress(student.id, full.id);
check("başta %0, frontier 0", p.percent === 0 && computeFrontier(p.lessons, p.done) === 0);
await db.insert(progress).values({ userId: student.id, courseId: full.id, lessonId: full3.flatLessons[0].id });
p = await courseProgress(student.id, full.id);
check("video sonrası %33, frontier 1", p.percent === 33 && computeFrontier(p.lessons, p.done) === 1, `${p.percent}`);
await db.insert(quizAttempts).values({ quizId: qz.id, userId: student.id, score: "100", totalPoints: 2, earnedPoints: "2", passed: true, status: "completed", answers: {}, completedAt: new Date() });
await db.insert(assignmentSubmissions).values({ assignmentId: asg.id, userId: student.id, text: "yaptım" });
p = await courseProgress(student.id, full.id);
check("sınav+görev sonrası %100", p.percent === 100, `${p.percent}`);

// 5) Göreli son teslim: esnek kurs, started_at yok → süre başlamaz; started_at verilince +2 gün
let base = await studentTaskBase(student.id, full.id);
check("başlamadan due yok", taskDue(base, 2) === null);
const startedAt = new Date("2026-08-20T14:30:00");
await db.update(enrollments).set({ startedAt }).where(eq(enrollments.id, en.id));
base = await studentTaskBase(student.id, full.id);
const due = taskDue(base, 2)!;
check("esnek: started_at + 2 gün aynı saat", due.getDate() === 22 && due.getHours() === 14 && due.getMinutes() === 30, due.toString());

// 6) Panel aksiyon listesi
const acts = await studentActions(student.id);
check("aksiyonlar listelendi", acts.items.some((i) => i.kind === "quiz" && i.done) && acts.items.some((i) => i.kind === "assignment" && i.status === "submitted"));

// 7) Çoğalt
const dupId = await duplicateCourse(full.id);
const dup = (await getCourseFull(dupId!))!;
const dupQ = await db.select().from(quizzes).where(eq(quizzes.courseId, dupId!));
check("çoğaltma: taslak, dersler ve sınav kopyalandı", dup.status === "draft" && dup.flatLessons.length === 3 && dupQ.length === 1);

// 8) Cron çalışır
const f = await runFrequent();
const d = await runDaily();
check("cron çalıştı", typeof f === "number" && typeof d === "object");

// Temizlik
await unenrollUser(student.id, full.id);
await db.delete(courses).where(eq(courses.id, full.id));
await db.delete(courses).where(eq(courses.id, dupId!));
const left = await db.select().from(lessons).where(eq(lessons.courseId, full.id));
check("cascade temizlik", left.length === 0);

console.log(fails ? `\n${fails} hata` : "\nAkış testi geçti");
process.exit(fails ? 1 : 0);
