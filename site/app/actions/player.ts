"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  progress, lessons, quizzes, quizQuestions, quizAttempts, assignments, assignmentSubmissions, questions, courses, instructors,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { playerAccess } from "@/lib/player";
import { saveUploadedFile, DOCUMENT_EXTENSIONS, AUDIO_EXTENSIONS } from "@/lib/uploads";
import { notifyUser } from "@/lib/notify";
import { sendMail, emailTemplate, siteUrl, adminEmails } from "@/lib/mailer";
import { taskDue, deadlineOf } from "@/lib/course-logic";
import { studentTaskBase } from "@/lib/data/student";
import { autoIssueCertificates } from "@/lib/cert-issue";

async function access(courseId: number) {
  const user = await getCurrentUser();
  if (!user) return null;
  const a = await playerAccess(user, courseId);
  if (!a.ok) return null;
  return { user, preview: a.preview };
}

/** Kurs eğitmeninin kullanıcı id'si (bildirim için) */
export async function courseTeacherUserId(courseId: number): Promise<number | null> {
  const [c] = await db.select({ authorId: courses.authorId, instructorId: courses.instructorId }).from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c) return null;
  if (c.instructorId) {
    const [i] = await db.select({ userId: instructors.userId }).from(instructors).where(eq(instructors.id, c.instructorId)).limit(1);
    if (i?.userId) return i.userId;
  }
  return c.authorId ?? null;
}

export async function markLessonComplete(courseId: number, lessonId: number) {
  const ctx = await access(courseId);
  if (!ctx || ctx.preview) return { ok: false };
  const [l] = await db.select().from(lessons).where(and(eq(lessons.id, lessonId), eq(lessons.courseId, courseId))).limit(1);
  if (!l) return { ok: false };
  await db
    .insert(progress)
    .values({ userId: ctx.user.id, courseId, lessonId })
    .onConflictDoNothing();
  await autoIssueCertificates(ctx.user.id, courseId);
  revalidatePath(`/kurs-izle/${courseId}`);
  return { ok: true };
}

export async function markLessonIncomplete(courseId: number, lessonId: number) {
  const ctx = await access(courseId);
  if (!ctx || ctx.preview) return { ok: false };
  await db.delete(progress).where(and(eq(progress.userId, ctx.user.id), eq(progress.lessonId, lessonId)));
  revalidatePath(`/kurs-izle/${courseId}`);
  return { ok: true };
}

/**
 * Anlık geri bildirimli sınav (esnek/ücretsiz kurslar): tek sorunun cevabını kontrol eder,
 * doğruluk + doğru cevap + açıklama döner. Açık uçlu sorularda kullanılmaz.
 */
export async function answerQuizQuestion(quizId: number, questionId: number, answer: number | string) {
  const [q] = await db.select().from(quizzes).where(eq(quizzes.id, quizId)).limit(1);
  if (!q) return { ok: false as const, error: "Sınav bulunamadı." };
  const ctx = await access(q.courseId);
  if (!ctx) return { ok: false as const, error: "Erişim yok." };
  const [x] = await db.select().from(quizQuestions).where(and(eq(quizQuestions.id, questionId), eq(quizQuestions.quizId, quizId))).limit(1);
  if (!x || x.type === "open_ended") return { ok: false as const, error: "Soru bulunamadı." };
  let correct = false;
  let correctAnswer: number | string | null = null;
  if (x.type === "multiple_choice") {
    const idx = typeof answer === "number" ? answer : parseInt(String(answer), 10);
    correct = Array.isArray(x.correct) && x.correct.includes(idx);
    correctAnswer = Array.isArray(x.correct) ? x.correct[0] ?? null : null;
  } else {
    correct = String(answer) === String(x.correct);
    correctAnswer = String(x.correct);
  }
  return { ok: true as const, correct, correctAnswer, explanation: x.explanation ?? "" };
}

export type QuizResult =
  | { ok: false; error: string }
  | { ok: true; pending: true }
  | { ok: true; pending: false; score: number; earned: number; total: number; passed: boolean; correct: number; count: number };

export async function submitQuiz(quizId: number, answers: Record<string, number | string>): Promise<QuizResult> {
  const [q] = await db.select().from(quizzes).where(eq(quizzes.id, quizId)).limit(1);
  if (!q) return { ok: false, error: "Sınav bulunamadı." };
  const ctx = await access(q.courseId);
  if (!ctx) return { ok: false, error: "Erişim yok." };
  if (ctx.preview) return { ok: false, error: "Önizleme modunda sınav gönderilemez." };

  const prev = await db
    .select({ id: quizAttempts.id, status: quizAttempts.status })
    .from(quizAttempts)
    .where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.userId, ctx.user.id)));
  const finished = prev.filter((p) => p.status !== "in_progress").length;
  if (q.maxAttempts > 0 && finished >= q.maxAttempts) return { ok: false, error: "Deneme hakkın doldu." };

  const qs = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quizId));
  let total = 0, earned = 0, correct = 0, hasOpen = false;
  for (const x of qs) {
    total += x.points;
    const a = answers[String(x.id)];
    if (x.type === "open_ended") { hasOpen = true; continue; }
    let ok = false;
    if (x.type === "multiple_choice") {
      const idx = typeof a === "number" ? a : parseInt(String(a), 10);
      ok = Array.isArray(x.correct) && x.correct.includes(idx);
    } else if (x.type === "true_false") {
      ok = String(a) === String(x.correct);
    }
    if (ok) { earned += x.points; correct++; }
  }
  const score = total > 0 ? Math.round((earned / total) * 10000) / 100 : 0;
  const passed = q.passScore === 0 ? true : score >= q.passScore;
  await db.insert(quizAttempts).values({
    quizId,
    userId: ctx.user.id,
    score: hasOpen ? null : score.toFixed(2),
    totalPoints: total,
    earnedPoints: earned.toFixed(2),
    passed: hasOpen ? null : passed,
    status: hasOpen ? "pending_review" : "completed",
    answers,
    completedAt: new Date(),
  });
  revalidatePath(`/kurs-izle/${q.courseId}`);

  // Yönetici + eğitmen bilgilendirme (son tarih geçtiyse "geç teslim" olarak işaretle)
  const qDue = q.extraDays && q.extraDays > 0 ? taskDue(await studentTaskBase(ctx.user.id, q.courseId), q.extraDays) : deadlineOf(q.endDate);
  const qLate = !!qDue && qDue.getTime() < Date.now();
  const teacher = await courseTeacherUserId(q.courseId);
  if (teacher) {
    await notifyUser(teacher, { title: hasOpen ? "📝 Değerlendirme bekleyen sınav" : "📝 Sınav tamamlandı", body: `${ctx.user.name} · ${q.title}${qLate ? " · ⏰ Geç teslim" : ""}`, url: `/egitmen/gonderim#sinav`, tag: `qz-${quizId}` });
  }
  const admins = await adminEmails();
  if (admins.length) {
    await sendMail({ type: "quiz_completed", to: admins, subject: `Sınav tamamlandı: ${ctx.user.name}${qLate ? " (geç teslim)" : ""}`, html: emailTemplate({ title: "Sınav tamamlandı", html: `<p><b>${ctx.user.name}</b> "${q.title}" sınavını tamamladı.${hasOpen ? " Açık uçlu sorular değerlendirme bekliyor." : ` Puan: %${score}`}${qLate ? " <b>Son tarihten sonra teslim edildi.</b>" : ""}</p>`, buttonText: "Sonuçlar", buttonUrl: siteUrl("/admin/gonderimler") }) });
  }
  await autoIssueCertificates(ctx.user.id, q.courseId);
  if (hasOpen) return { ok: true, pending: true };
  return { ok: true, pending: false, score, earned, total, passed, correct, count: qs.filter((x) => x.type !== "open_ended").length };
}

export async function uploadAssignmentFile(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Giriş gerekli." };
  const up = await saveUploadedFile(formData.get("file"), `gorev/${user.id}`, DOCUMENT_EXTENSIONS, 10 * 1024 * 1024);
  if (!up.ok) return up;
  if (!up.publicPath) return { ok: false as const, error: "Dosya seçilmedi." };
  return { ok: true as const, url: up.publicPath, name: up.name ?? "dosya" };
}

export async function uploadVoice(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Giriş gerekli." };
  const up = await saveUploadedFile(formData.get("file"), `ses/${user.id}`, new Set([...AUDIO_EXTENSIONS, "webm", "mp4", "m4a"]), 20 * 1024 * 1024);
  if (!up.ok) return up;
  if (!up.publicPath) return { ok: false as const, error: "Kayıt yok." };
  return { ok: true as const, url: up.publicPath };
}

export async function submitAssignment(input: {
  assignmentId: number;
  text: string;
  files: { url: string; name: string }[];
  voices: { url: string; duration?: number }[];
}) {
  const [a] = await db.select().from(assignments).where(eq(assignments.id, input.assignmentId)).limit(1);
  if (!a) return { ok: false, error: "Görev bulunamadı." };
  const ctx = await access(a.courseId);
  if (!ctx) return { ok: false, error: "Erişim yok." };
  if (ctx.preview) return { ok: false, error: "Önizleme modunda gönderim yapılamaz." };
  const files = (input.files ?? []).filter((f) => f.url.startsWith("/uploads/")).slice(0, 10);
  const voices = (input.voices ?? []).filter((f) => f.url.startsWith("/uploads/")).slice(0, 5);
  const text = (input.text ?? "").slice(0, 20000);
  if (!text.trim() && files.length === 0 && voices.length === 0) return { ok: false, error: "Metin, dosya ya da ses kaydından en az birini ekle." };

  const [existing] = await db
    .select()
    .from(assignmentSubmissions)
    .where(and(eq(assignmentSubmissions.assignmentId, a.id), eq(assignmentSubmissions.userId, ctx.user.id)))
    .limit(1);
  if (existing?.status === "graded") return { ok: false, error: "Bu görev değerlendirildi; tekrar gönderilemez." };
  if (existing) {
    await db.update(assignmentSubmissions).set({ text, files, voices, updatedAt: new Date(), status: "pending" }).where(eq(assignmentSubmissions.id, existing.id));
  } else {
    await db.insert(assignmentSubmissions).values({ assignmentId: a.id, userId: ctx.user.id, text, files, voices });
  }
  revalidatePath(`/kurs-izle/${a.courseId}`);

  // Son tarih geçtiyse eğitmen/yönetici "geç teslim" olarak bilgilendirilir
  const aDue = a.extraDays > 0 ? taskDue(await studentTaskBase(ctx.user.id, a.courseId), a.extraDays) : deadlineOf(a.dueDate);
  const aLate = !!aDue && aDue.getTime() < Date.now();
  const teacher = await courseTeacherUserId(a.courseId);
  if (teacher) {
    await notifyUser(teacher, { title: aLate ? "📤 Geç görev gönderimi" : "📤 Yeni görev gönderimi", body: `${ctx.user.name} · ${a.title}${aLate ? " · ⏰ Geç teslim" : ""}`, url: `/egitmen/gonderim#gorev`, tag: `asg-${a.id}` });
  }
  const admins = await adminEmails();
  if (admins.length) {
    await sendMail({
      type: "assignment_submitted",
      to: admins,
      subject: `Görev teslim edildi: ${ctx.user.name}${aLate ? " (geç teslim)" : ""}`,
      html: emailTemplate({ title: "Görev teslimi", html: `<p><b>${ctx.user.name}</b> "${a.title}" görevini teslim etti.${aLate ? " <b>Son tarihten sonra teslim edildi.</b>" : ""}</p>`, buttonText: "Görevler & Sınavlar", buttonUrl: siteUrl("/egitmen/gonderim") }),
    });
  }
  await autoIssueCertificates(ctx.user.id, a.courseId);
  return { ok: true };
}

export async function askQuestion(courseId: number, lessonId: number | null, lessonTitle: string, text: string) {
  const ctx = await access(courseId);
  if (!ctx) return { ok: false, error: "Erişim yok." };
  const t = text.trim().slice(0, 5000);
  if (t.length < 3) return { ok: false, error: "Sorunu yaz." };
  await db.insert(questions).values({ userId: ctx.user.id, courseId, lessonId, lessonTitle, text: t });
  const teacher = await courseTeacherUserId(courseId);
  if (teacher) {
    await notifyUser(teacher, { title: "❓ Yeni soru", body: `${ctx.user.name}: ${t.slice(0, 80)}`, url: `/egitmen/sorular?chat=${ctx.user.id}_${courseId}`, tag: `qa-${ctx.user.id}-${courseId}` });
  }
  const admins = await adminEmails();
  if (admins.length) {
    await sendMail({
      type: "question_asked",
      to: admins,
      subject: `Yeni soru: ${ctx.user.name}`,
      html: emailTemplate({ title: "Yeni öğrenci sorusu", html: `<p><b>${ctx.user.name}</b> — ${lessonTitle}</p><p>${t}</p>`, buttonText: "Cevapla", buttonUrl: siteUrl(`/egitmen/sorular?chat=${ctx.user.id}_${courseId}`) }),
    });
  }
  revalidatePath(`/kurs-izle/${courseId}`);
  return { ok: true };
}
