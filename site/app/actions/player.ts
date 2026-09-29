"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  progress, lessons, quizzes, quizQuestions, quizAttempts, assignments, assignmentSubmissions, questions, courses, instructors, courseSuggestions,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { playerAccess, lessonUnlocked, evaluateAnswer } from "@/lib/player";
import { saveUploadedFile, DOCUMENT_EXTENSIONS, AUDIO_EXTENSIONS } from "@/lib/uploads";
import { notifyUser } from "@/lib/notify";
import { sendMail, emailTemplate, siteUrl, adminEmails, escapeHtml } from "@/lib/mailer";
import { taskDue, deadlineOf, quizStanding } from "@/lib/course-logic";
import { studentTaskBase } from "@/lib/data/student";
import { autoIssueCertificates } from "@/lib/cert-issue";
import { SUGGESTION_MAX_LEN, SUGGESTION_MAX_COUNT, type SuggestionItem } from "@/lib/suggestions";
import { isId } from "@/lib/format";

// Sunucu işlevlerinin parametreleri istemciden gelir; elle oynanmış istekte sayı yerine "abc", 1.5 ya da null gelebilir.
// Geçersiz kimlik veritabanına gitmeden "bulunamadı / erişim yok" olarak karşılanır (sunucu hatası vermez).
async function access(courseId: number) {
  if (!isId(courseId)) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const a = await playerAccess(user, courseId);
  if (!a.ok) return null;
  return { user, preview: a.preview };
}

/** Kurs eğitmeninin kullanıcı id'si (bildirim için). DIŞA AÇILMAZ: "use server" dosyasında export edilen her işlev herkese açık bir sunucu işlemi olur. */
async function courseTeacherUserId(courseId: number): Promise<number | null> {
  const [c] = await db.select({ authorId: courses.authorId, instructorId: courses.instructorId }).from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c) return null;
  if (c.instructorId) {
    const [i] = await db.select({ userId: instructors.userId }).from(instructors).where(eq(instructors.id, c.instructorId)).limit(1);
    if (i?.userId) return i.userId;
  }
  return c.authorId ?? null;
}

export async function markLessonComplete(courseId: number, lessonId: number) {
  if (!isId(lessonId)) return { ok: false };
  const ctx = await access(courseId);
  if (!ctx || ctx.preview) return { ok: false };
  const [l] = await db.select().from(lessons).where(and(eq(lessons.id, lessonId), eq(lessons.courseId, courseId))).limit(1);
  // Sınav ve görev dersleri yalnızca sınavı geçerek / görevi teslim ederek tamamlanır; kilitli ders işaretlenemez
  if (!l || (l.type !== "video" && l.type !== "file")) return { ok: false };
  if (!(await lessonUnlocked(ctx.user.id, courseId, lessonId))) return { ok: false };
  await db
    .insert(progress)
    .values({ userId: ctx.user.id, courseId, lessonId })
    .onConflictDoNothing();
  await autoIssueCertificates(ctx.user.id, courseId);
  revalidatePath(`/kurs-izle/${courseId}`);
  return { ok: true };
}

export async function markLessonIncomplete(courseId: number, lessonId: number) {
  if (!isId(lessonId)) return { ok: false };
  const ctx = await access(courseId);
  if (!ctx || ctx.preview) return { ok: false };
  await db.delete(progress).where(and(eq(progress.userId, ctx.user.id), eq(progress.lessonId, lessonId)));
  revalidatePath(`/kurs-izle/${courseId}`);
  return { ok: true };
}

/** Aynı öğrencinin aynı sınavdaki işlemlerini sıraya sokar (çift sekme / art arda istek aynı denemeyi bozamaz) */
const quizLock = (userId: number, quizId: number) => sql`select pg_advisory_xact_lock(${userId}::int, ${quizId}::int)`;

/** Sınav öğrenciye açık mı? (yayında, dersi kilitli değil) */
async function quizGate(quizId: number) {
  if (!isId(quizId)) return { ok: false as const, error: "Sınav bulunamadı." };
  const [q] = await db.select().from(quizzes).where(eq(quizzes.id, quizId)).limit(1);
  if (!q || q.status !== "active") return { ok: false as const, error: "Sınav bulunamadı." };
  const ctx = await access(q.courseId);
  if (!ctx) return { ok: false as const, error: "Erişim yok." };
  if (!ctx.preview && q.lessonId && !(await lessonUnlocked(ctx.user.id, q.courseId, q.lessonId))) {
    return { ok: false as const, error: "Bu sınav henüz açılmadı; önce önceki içerikleri tamamla." };
  }
  return { ok: true as const, q, ctx };
}

const noAttemptError = (st: { passed: boolean }) => (st.passed ? "Bu sınavı zaten tamamladın." : "Deneme hakkın kalmadı. Yeni hak için eğitmenine yazabilirsin.");

/**
 * Anlık geri bildirimli sınav: tek sorunun cevabını kontrol eder, doğruluk + doğru cevap + açıklama döner.
 * Cevap, yarım kalan denemeye KAYDEDİLİR ve kilitlenir: doğru cevabı gördükten sonra sayfayı yenileyip
 * soruyu baştan cevaplamak mümkün değildir (ikinci istek ilk cevabın sonucunu döndürür).
 * Açık uçlu sorularda kullanılmaz.
 */
export async function answerQuizQuestion(quizId: number, questionId: number, answer: number | string) {
  const g = await quizGate(quizId);
  if (!g.ok) return g;
  const { q, ctx } = g;
  if (!isId(questionId)) return { ok: false as const, error: "Soru bulunamadı." };
  const [x] = await db.select().from(quizQuestions).where(and(eq(quizQuestions.id, questionId), eq(quizQuestions.quizId, quizId))).limit(1);
  if (!x || x.type === "open_ended") return { ok: false as const, error: "Soru bulunamadı." };

  let value: number | string;
  if (x.type === "multiple_choice") {
    const idx = typeof answer === "number" ? answer : parseInt(String(answer), 10);
    if (!Number.isInteger(idx) || idx < 0 || idx >= x.options.length) return { ok: false as const, error: "Geçersiz cevap." };
    value = idx;
  } else {
    if (answer !== "true" && answer !== "false") return { ok: false as const, error: "Geçersiz cevap." };
    value = answer;
  }
  // Önizleme (eğitmen/yönetici): kayıt tutulmaz
  if (ctx.preview) return { ok: true as const, answer: value, locked: false, ...evaluateAnswer(x, value) };

  return db.transaction(async (tx) => {
    await tx.execute(quizLock(ctx.user.id, quizId));
    const atts = await tx.select().from(quizAttempts).where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.userId, ctx.user.id), eq(quizAttempts.voided, false)));
    const st = quizStanding(q, atts);
    if (!st.canAttempt) return { ok: false as const, error: noAttemptError(st) };
    let cur = atts.find((a) => a.status === "in_progress");
    if (!cur) [cur] = await tx.insert(quizAttempts).values({ quizId, userId: ctx.user.id, status: "in_progress", answers: {} }).returning();
    const stored = cur.answers[String(x.id)];
    if (stored !== undefined && stored !== null) {
      return { ok: true as const, answer: stored, locked: true, ...evaluateAnswer(x, stored) };
    }
    await tx.update(quizAttempts).set({ answers: { ...cur.answers, [String(x.id)]: value } }).where(eq(quizAttempts.id, cur.id));
    return { ok: true as const, answer: value, locked: false, ...evaluateAnswer(x, value) };
  });
}

export type QuizResult =
  | { ok: false; error: string }
  | { ok: true; score: number; earned: number; total: number; passed: boolean; correct: number; count: number; canRetry: boolean; left: number | null };

/**
 * Sınav gönderimi. Test/D-Y soruları otomatik puanlanır; açık uçlu sorular yalnızca kaydedilir (puanlanmaz).
 * Kontrol edilerek kilitlenmiş cevaplar istemciden gelenlerin önüne geçer. Geçme notu varsa ve öğrenci altında
 * kaldıysa sınav dersi tamamlanmış sayılmaz; hakkı varsa (maxAttempts, 0 = sınırsız) yeniden çözebilir.
 */
export async function submitQuiz(quizId: number, answers: Record<string, number | string>): Promise<QuizResult> {
  const g = await quizGate(quizId);
  if (!g.ok) return g;
  const { q, ctx } = g;
  if (ctx.preview) return { ok: false, error: "Önizleme modunda sınav gönderilemez." };

  const qs = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quizId));
  const result = await db.transaction(async (tx): Promise<QuizResult> => {
    await tx.execute(quizLock(ctx.user.id, quizId));
    const atts = await tx.select().from(quizAttempts).where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.userId, ctx.user.id), eq(quizAttempts.voided, false)));
    const st = quizStanding(q, atts);
    if (!st.canAttempt) return { ok: false, error: noAttemptError(st) };
    const cur = atts.find((a) => a.status === "in_progress");

    // Yalnızca bu sınavın sorularına ait, makul uzunlukta cevaplar; kilitli cevaplar üstte kalır
    const merged: Record<string, number | string> = {};
    for (const x of qs) {
      const locked = cur?.answers[String(x.id)];
      const raw = locked !== undefined && locked !== null ? locked : answers?.[String(x.id)];
      if (raw === undefined || raw === null) continue;
      merged[String(x.id)] = typeof raw === "number" ? raw : String(raw).slice(0, 5000);
    }
    // total: yalnızca otomatik puanlanan (test/D-Y) soruların puanı; açık uçlu puana katılmaz
    let total = 0, earned = 0, correct = 0, count = 0;
    for (const x of qs) {
      if (x.type === "open_ended") continue;
      total += x.points;
      count++;
      if (evaluateAnswer(x, merged[String(x.id)]).correct) { earned += x.points; correct++; }
    }
    const score = total > 0 ? Math.round((earned / total) * 10000) / 100 : 0;
    const passed = q.passScore === 0 ? true : score >= q.passScore;
    const values = {
      score: score.toFixed(2),
      totalPoints: total,
      earnedPoints: earned.toFixed(2),
      passed,
      status: "completed" as const,
      answers: merged,
      completedAt: new Date(),
    };
    if (cur) await tx.update(quizAttempts).set(values).where(eq(quizAttempts.id, cur.id));
    else await tx.insert(quizAttempts).values({ quizId, userId: ctx.user.id, ...values });
    const after = quizStanding(q, [...atts.filter((a) => a.id !== cur?.id), { status: "completed", passed, score: values.score }]);
    return { ok: true, score, earned, total, passed, correct, count, canRetry: after.canAttempt, left: after.left };
  });
  if (!result.ok) return result;
  revalidatePath(`/kurs-izle/${q.courseId}`);
  await autoIssueCertificates(ctx.user.id, q.courseId);
  return result;
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
  if (!input || !isId(input.assignmentId)) return { ok: false, error: "Görev bulunamadı." };
  const [a] = await db.select().from(assignments).where(eq(assignments.id, input.assignmentId)).limit(1);
  // Silinmiş görev teslim edilemez (eski bağlantı/elle istek)
  if (!a || a.status !== "active") return { ok: false, error: "Görev bulunamadı." };
  const ctx = await access(a.courseId);
  if (!ctx) return { ok: false, error: "Erişim yok." };
  if (ctx.preview) return { ok: false, error: "Önizleme modunda gönderim yapılamaz." };
  if (a.lessonId && !(await lessonUnlocked(ctx.user.id, a.courseId, a.lessonId))) {
    return { ok: false, error: "Bu görev henüz açılmadı; önce önceki içerikleri tamamla." };
  }
  const isUpload = (f: { url?: unknown } | null | undefined) => typeof f?.url === "string" && f.url.startsWith("/uploads/");
  const files = (Array.isArray(input.files) ? input.files : []).filter(isUpload).slice(0, 10).map((f) => ({ url: f.url, name: String(f.name ?? "dosya").slice(0, 200) }));
  const voices = (Array.isArray(input.voices) ? input.voices : []).filter(isUpload).slice(0, 5).map((f) => ({ url: f.url, ...(typeof f.duration === "number" && isFinite(f.duration) ? { duration: f.duration } : {}) }));
  const text = String(input.text ?? "").slice(0, 20000);
  if (!text.trim() && files.length === 0 && voices.length === 0) return { ok: false, error: "Metin, dosya ya da ses kaydından en az birini ekle." };

  const [existing] = await db
    .select()
    .from(assignmentSubmissions)
    .where(and(eq(assignmentSubmissions.assignmentId, a.id), eq(assignmentSubmissions.userId, ctx.user.id)))
    .limit(1);
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
    await notifyUser(teacher, { title: aLate ? "Geç görev gönderimi" : "Yeni görev gönderimi", body: `${ctx.user.name} · ${a.title}${aLate ? " · Geç teslim" : ""}`, url: `/egitmen/gonderim#gorev`, tag: `asg-${a.id}` });
  }
  const admins = await adminEmails();
  if (admins.length) {
    await sendMail({
      type: "assignment_submitted",
      to: admins,
      subject: `Görev teslim edildi: ${ctx.user.name}${aLate ? " (geç teslim)" : ""}`,
      html: emailTemplate({ title: "Görev teslimi", html: `<p><b>${escapeHtml(ctx.user.name)}</b> "${escapeHtml(a.title)}" görevini teslim etti.${aLate ? " <b>Son tarihten sonra teslim edildi.</b>" : ""}</p>`, buttonText: "Görevler & Sınavlar", buttonUrl: siteUrl("/egitmen/gonderim") }),
    });
  }
  await autoIssueCertificates(ctx.user.id, a.courseId);
  return { ok: true };
}

/** Kurs önerisi ekle. Kurs başına en çok 5, her biri en çok 1000 karakter. Cevaplanmaz. */
export async function addSuggestion(
  courseId: number,
  text: string,
): Promise<{ ok: true; items: SuggestionItem[] } | { ok: false; error: string }> {
  const ctx = await access(courseId);
  if (!ctx) return { ok: false, error: "Erişim yok." };
  if (ctx.preview) return { ok: false, error: "Önizleme modunda öneri gönderilemez." };
  const t = (typeof text === "string" ? text : "").trim().slice(0, SUGGESTION_MAX_LEN);
  if (t.length < 3) return { ok: false, error: "Önerini yaz." };

  const mine = await db
    .select({ id: courseSuggestions.id })
    .from(courseSuggestions)
    .where(and(eq(courseSuggestions.userId, ctx.user.id), eq(courseSuggestions.courseId, courseId)));
  if (mine.length >= SUGGESTION_MAX_COUNT) {
    return { ok: false, error: `Bu kurs için en fazla ${SUGGESTION_MAX_COUNT} öneri bırakabilirsin.` };
  }

  await db.insert(courseSuggestions).values({ userId: ctx.user.id, courseId, text: t });
  revalidatePath(`/kurs-izle/${courseId}`);
  return { ok: true, items: await listSuggestions(courseId, ctx.user.id) };
}

async function listSuggestions(courseId: number, userId: number): Promise<SuggestionItem[]> {
  const rows = await db
    .select({ id: courseSuggestions.id, text: courseSuggestions.text, createdAt: courseSuggestions.createdAt })
    .from(courseSuggestions)
    .where(and(eq(courseSuggestions.userId, userId), eq(courseSuggestions.courseId, courseId)))
    .orderBy(desc(courseSuggestions.id));
  return rows.map((r) => ({ id: r.id, text: r.text, createdAt: r.createdAt.toISOString() }));
}

export async function askQuestion(courseId: number, lessonId: number | null, lessonTitle: string, text: string) {
  const ctx = await access(courseId);
  if (!ctx) return { ok: false, error: "Erişim yok." };
  const t = (typeof text === "string" ? text : "").trim().slice(0, 5000);
  if (t.length < 3) return { ok: false, error: "Sorunu yaz." };
  // Ders bilgisi yalnızca bu kursun dersiyse kaydedilir
  let lessonRef: number | null = null;
  if (isId(lessonId)) {
    const [l] = await db.select({ id: lessons.id }).from(lessons).where(and(eq(lessons.id, lessonId), eq(lessons.courseId, courseId))).limit(1);
    lessonRef = l?.id ?? null;
  }
  await db.insert(questions).values({ userId: ctx.user.id, courseId, lessonId: lessonRef, lessonTitle: String(lessonTitle ?? "").slice(0, 300), text: t });
  const teacher = await courseTeacherUserId(courseId);
  if (teacher) {
    await notifyUser(teacher, { title: "Yeni soru", body: `${ctx.user.name}: ${t.slice(0, 80)}`, url: `/egitmen/sorular?chat=${ctx.user.id}_${courseId}`, tag: `qa-${ctx.user.id}-${courseId}` });
  }
  const admins = await adminEmails();
  if (admins.length) {
    await sendMail({
      type: "question_asked",
      to: admins,
      subject: `Yeni soru: ${ctx.user.name}`,
      html: emailTemplate({ title: "Yeni öğrenci sorusu", html: `<p><b>${escapeHtml(ctx.user.name)}</b> — ${escapeHtml(lessonTitle)}</p><p style="white-space:pre-line">${escapeHtml(t)}</p>`, buttonText: "Cevapla", buttonUrl: siteUrl(`/egitmen/sorular?chat=${ctx.user.id}_${courseId}`) }),
    });
  }
  revalidatePath(`/kurs-izle/${courseId}`);
  return { ok: true };
}
