"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  courses, enrollments, questions, questionAnswers, assignmentSubmissions, assignments, quizAttempts, quizzes, quizQuestions, users,
  issuedCertificates, certificateTemplates, teacherEvents, documents, coupons, periods, periodEnrollments,
} from "@/db/schema";
import { requireTeacher } from "@/lib/auth/session";
import { ownsCourse, ensureInstructorProfile, teacherCourseIds } from "@/lib/data/teacher";
import { courseInputSchema, saveCourse, duplicateCourse as dup } from "@/lib/course-save";
import { saveUploadedFile, IMAGE_EXTENSIONS, slugify } from "@/lib/uploads";
import { notifyUser, notifyUsers, logNotification } from "@/lib/notify";
import { sendMail, emailTemplate, siteUrl } from "@/lib/mailer";
import { courseProgress } from "@/lib/data/student";
import { CERT_CONDITIONS } from "@/lib/certificates";

export type ActionResult = { ok: true; message?: string; id?: number; url?: string } | { ok: false; error: string };

export async function saveCourseAction(raw: unknown): Promise<ActionResult> {
  const user = await requireTeacher();
  const parsed = courseInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = (issue?.path ?? []).reduce<string[]>((acc, seg, i, arr) => {
      const prev = arr[i - 1];
      if (typeof seg === "number") {
        if (prev === "modules") acc.push(`Modül ${seg + 1}`);
        else if (prev === "lessons") acc.push(`Ders ${seg + 1}`);
        else if (prev === "questions") acc.push(`Soru ${seg + 1}`);
        else if (prev === "periods") acc.push(`Dönem ${seg + 1}`);
        else if (prev === "schedule") acc.push(`Oturum ${seg + 1}`);
      } else if (i === arr.length - 1) acc.push(String(seg));
      return acc;
    }, []).join(" › ");
    const msg = issue?.message === "Invalid input" ? "geçersiz değer" : issue?.message ?? "hata";
    return { ok: false, error: `Form hatası${where ? ` (${where})` : ""}: ${msg}` };
  }
  const input = parsed.data;
  const isAdmin = user.role === "admin";
  let locked = false;
  if (input.id) {
    if (!(await ownsCourse(user, input.id))) return { ok: false, error: "Bu kursa erişim yetkin yok." };
    const [c] = await db.select({ status: courses.status }).from(courses).where(eq(courses.id, input.id)).limit(1);
    locked = !isAdmin && c?.status === "published";
  }
  const prof = await ensureInstructorProfile(user);
  const r = await saveCourse(input, { authorId: user.id, instructorId: isAdmin ? (input.instructorId ?? null) : prof.id, locked, isAdmin });
  // Yayındaki kursa yeni sınav/görev eklendiyse kayıtlı öğrencilere haber ver
  if (input.status === "published" && (r.created.quizzes.length || r.created.assignments.length)) {
    const studs = await db.select({ id: users.id, email: users.email }).from(enrollments).innerJoin(users, eq(enrollments.userId, users.id)).where(and(eq(enrollments.courseId, r.courseId), eq(enrollments.status, "active")));
    const ids = studs.map((s) => s.id);
    for (const q of r.created.quizzes) {
      await notifyUsers(ids, { title: "📝 Yeni sınav", body: `${q.title} · ${input.title}`, url: `/kurs-izle/${r.courseId}?quiz=${q.id}`, tag: `qz-${q.id}` });
      for (const st of studs) await sendMail({ type: "new_quiz", to: st.email, subject: `Yeni sınav: ${q.title}`, html: emailTemplate({ title: "Yeni sınav atandı", html: `<p><b>${input.title}</b> programına <b>${q.title}</b> sınavı eklendi.</p>`, buttonText: "Sınava git", buttonUrl: siteUrl(`/kurs-izle/${r.courseId}?quiz=${q.id}`) }) });
    }
    for (const a of r.created.assignments) {
      await notifyUsers(ids, { title: "📚 Yeni görev", body: `${a.title} · ${input.title}`, url: `/kurs-izle/${r.courseId}?gorev=${a.id}`, tag: `asg-${a.id}` });
      for (const st of studs) await sendMail({ type: "new_assignment", to: st.email, subject: `Yeni görev: ${a.title}`, html: emailTemplate({ title: "Yeni görev atandı", html: `<p><b>${input.title}</b> programına <b>${a.title}</b> görevi eklendi.</p>`, buttonText: "Göreve git", buttonUrl: siteUrl(`/kurs-izle/${r.courseId}?gorev=${a.id}`) }) });
    }
  }
  revalidatePath("/egitmen"); revalidatePath("/kesfet"); revalidatePath("/");
  return { ok: true, id: r.courseId, url: `/program/${r.slug}`, message: locked ? "Değişiklikler kaydedildi (yayındaki müfredat korunuyor)." : "Kaydedildi." };
}

export async function duplicateCourseAction(courseId: number): Promise<ActionResult> {
  const user = await requireTeacher();
  if (!(await ownsCourse(user, courseId))) return { ok: false, error: "Yetki yok." };
  const id = await dup(courseId);
  if (!id) return { ok: false, error: "Kurs bulunamadı." };
  revalidatePath("/egitmen");
  return { ok: true, id };
}

export async function deleteCourseAction(courseId: number): Promise<ActionResult> {
  const user = await requireTeacher();
  if (!(await ownsCourse(user, courseId))) return { ok: false, error: "Yetki yok." };
  const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(enrollments).where(and(eq(enrollments.courseId, courseId), eq(enrollments.status, "active")));
  if (n > 0) {
    await db.update(courses).set({ status: "draft", closed: true }).where(eq(courses.id, courseId));
    revalidatePath("/egitmen");
    return { ok: true, message: "Kayıtlı öğrenci olduğu için kurs silinmedi; taslağa alınıp kapatıldı." };
  }
  await db.delete(courses).where(eq(courses.id, courseId));
  revalidatePath("/egitmen"); revalidatePath("/kesfet");
  return { ok: true, message: "Kurs silindi." };
}

export async function toggleCourseClosed(courseId: number, closed: boolean): Promise<ActionResult> {
  const user = await requireTeacher();
  if (!(await ownsCourse(user, courseId))) return { ok: false, error: "Yetki yok." };
  await db.update(courses).set({ closed }).where(eq(courses.id, courseId));
  revalidatePath("/egitmen"); revalidatePath("/kesfet");
  return { ok: true };
}

export async function uploadCourseImage(formData: FormData) {
  await requireTeacher();
  const up = await saveUploadedFile(formData.get("file"), "kurs", IMAGE_EXTENSIONS, 5 * 1024 * 1024);
  if (!up.ok) return up;
  return { ok: true as const, url: up.publicPath ?? "" };
}

/** Korumalı ders dosyası: public dışına, rastgele adla */
export async function uploadProtectedFile(formData: FormData) {
  await requireTeacher();
  const f = formData.get("file");
  if (!(f instanceof File) || f.size === 0) return { ok: false as const, error: "Dosya yok." };
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["pdf", "jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return { ok: false as const, error: "Yalnızca PDF ve resim." };
  if (f.size > 50 * 1024 * 1024) return { ok: false as const, error: "En fazla 50 MB." };
  const dir = path.join(process.cwd(), "private", "korumali");
  await mkdir(dir, { recursive: true });
  const key = `${randomBytes(16).toString("hex")}.${ext}`;
  await writeFile(path.join(dir, key), Buffer.from(await f.arrayBuffer()));
  return { ok: true as const, fileUrl: key, fileName: f.name, fileMime: f.type || (ext === "pdf" ? "application/pdf" : `image/${ext}`) };
}

export async function answerQuestion(studentId: number, courseId: number, text: string): Promise<ActionResult> {
  const user = await requireTeacher();
  if (!(await ownsCourse(user, courseId))) return { ok: false, error: "Yetki yok." };
  const t = text.trim();
  if (!t) return { ok: false, error: "Cevap boş." };
  const qs = await db.select().from(questions).where(and(eq(questions.userId, studentId), eq(questions.courseId, courseId))).orderBy(questions.id);
  const last = qs[qs.length - 1];
  if (!last) return { ok: false, error: "Soru bulunamadı." };
  await db.insert(questionAnswers).values({ questionId: last.id, userId: user.id, text: t, isInstructor: true });
  await db.update(questions).set({ status: "answered" }).where(and(eq(questions.userId, studentId), eq(questions.courseId, courseId), eq(questions.status, "pending")));
  const [c] = await db.select({ title: courses.title }).from(courses).where(eq(courses.id, courseId)).limit(1);
  const [s] = await db.select().from(users).where(eq(users.id, studentId)).limit(1);
  const url = `/kurs-izle/${courseId}`;
  await notifyUser(studentId, { title: `💬 Sorun yanıtlandı — ${c?.title ?? ""}`, body: t.slice(0, 100), url, tag: `qa-${courseId}` });
  if (s) {
    await sendMail({ type: "question_answered", to: s.email, subject: "Sorun cevaplandı", html: emailTemplate({ title: "Sorun cevaplandı", html: `<p><b>${c?.title}</b> programındaki sorun yanıtlandı:</p><blockquote>${t}</blockquote>`, buttonText: "Cevabı gör", buttonUrl: siteUrl(url) }) });
  }
  revalidatePath("/egitmen/sorular");
  return { ok: true };
}

export async function gradeSubmission(submissionId: number, score: number, feedback: string): Promise<ActionResult> {
  const user = await requireTeacher();
  const [row] = await db.select({ s: assignmentSubmissions, a: assignments }).from(assignmentSubmissions).innerJoin(assignments, eq(assignmentSubmissions.assignmentId, assignments.id)).where(eq(assignmentSubmissions.id, submissionId)).limit(1);
  if (!row || !(await ownsCourse(user, row.a.courseId))) return { ok: false, error: "Yetki yok." };
  const max = row.a.isGraded ? row.a.maxScore : 100;
  const sc = Math.max(0, Math.min(max, Math.round(score)));
  await db.update(assignmentSubmissions).set({ score: sc, feedback: feedback.slice(0, 5000), status: "graded", gradedBy: user.id, gradedAt: new Date() }).where(eq(assignmentSubmissions.id, submissionId));
  const url = `/kurs-izle/${row.a.courseId}?gorev=${row.a.id}`;
  await notifyUser(row.s.userId, { title: "✅ Görevin değerlendirildi", body: `${row.a.title} · ${sc}/${max}`, url, tag: `asgg-${submissionId}` });
  const [st] = await db.select().from(users).where(eq(users.id, row.s.userId)).limit(1);
  if (st) await sendMail({ type: "assignment_graded", to: st.email, subject: `Görevin değerlendirildi: ${row.a.title}`, html: emailTemplate({ title: "Görevin değerlendirildi", html: `<p><b>${row.a.title}</b> · Puan: <b>${sc}/${max}</b></p>${feedback ? `<p>${feedback}</p>` : ""}`, buttonText: "Göreve git", buttonUrl: siteUrl(url) }) });
  revalidatePath("/egitmen/gonderim");
  return { ok: true };
}

export async function gradeOpenEnded(attemptId: number, grades: Record<string, { points: number; feedback: string }>): Promise<ActionResult> {
  const user = await requireTeacher();
  const [row] = await db.select({ at: quizAttempts, q: quizzes }).from(quizAttempts).innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id)).where(eq(quizAttempts.id, attemptId)).limit(1);
  if (!row || !(await ownsCourse(user, row.q.courseId))) return { ok: false, error: "Yetki yok." };
  const qs = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, row.q.id));
  let total = 0, earned = 0;
  for (const x of qs) {
    total += x.points;
    const a = row.at.answers[String(x.id)];
    if (x.type === "open_ended") {
      const g = grades[String(x.id)];
      earned += Math.max(0, Math.min(x.points, Number(g?.points ?? 0)));
    } else if (x.type === "multiple_choice") {
      if (Array.isArray(x.correct) && x.correct.includes(Number(a))) earned += x.points;
    } else if (String(a) === String(x.correct)) earned += x.points;
  }
  const score = total ? Math.round((earned / total) * 10000) / 100 : 0;
  const passed = row.q.passScore === 0 ? true : score >= row.q.passScore;
  await db.update(quizAttempts).set({ score: score.toFixed(2), earnedPoints: earned.toFixed(2), totalPoints: total, passed, status: "completed", grades }).where(eq(quizAttempts.id, attemptId));
  await notifyUser(row.at.userId, { title: "✅ Sınavın değerlendirildi", body: `${row.q.title} · %${score}`, url: `/kurs-izle/${row.q.courseId}?quiz=${row.q.id}`, tag: `qzg-${attemptId}` });
  revalidatePath("/egitmen/gonderim");
  return { ok: true, message: `Puan: %${score}` };
}

export async function quizAttemptDetail(attemptId: number) {
  const user = await requireTeacher();
  const [row] = await db.select({ at: quizAttempts, q: quizzes, u: users }).from(quizAttempts).innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id)).innerJoin(users, eq(quizAttempts.userId, users.id)).where(eq(quizAttempts.id, attemptId)).limit(1);
  if (!row || !(await ownsCourse(user, row.q.courseId))) return null;
  const qs = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, row.q.id)).orderBy(quizQuestions.sortOrder, quizQuestions.id);
  return {
    id: row.at.id, title: row.q.title, student: `${row.u.firstName} ${row.u.lastName}`.trim(), status: row.at.status, score: row.at.score ? Number(row.at.score) : null,
    questions: qs.map((x) => {
      const a = row.at.answers[String(x.id)];
      const correct = x.type === "multiple_choice" ? (Array.isArray(x.correct) && x.correct.includes(Number(a))) : x.type === "true_false" ? String(a) === String(x.correct) : null;
      return {
        id: x.id, text: x.text, type: x.type, points: x.points, options: x.options,
        answer: a === undefined ? null : x.type === "multiple_choice" ? (x.options[Number(a)] ?? String(a)) : x.type === "true_false" ? (a === "true" ? "Doğru" : "Yanlış") : String(a),
        correctAnswer: x.type === "multiple_choice" ? (Array.isArray(x.correct) ? x.correct.map((i) => x.options[i]).join(", ") : "") : x.type === "true_false" ? (x.correct === "true" ? "Doğru" : "Yanlış") : "",
        correct, grade: row.at.grades[String(x.id)] ?? null,
      };
    }),
  };
}

export async function issueCertificate(templateId: number, studentId: number, courseId: number): Promise<ActionResult> {
  const user = await requireTeacher();
  if (!(await ownsCourse(user, courseId))) return { ok: false, error: "Yetki yok." };
  const [t] = await db.select().from(certificateTemplates).where(eq(certificateTemplates.id, templateId)).limit(1);
  if (!t) return { ok: false, error: "Sertifika tasarımı bulunamadı." };
  if (t.rule.scope === "course" && t.rule.courseId !== courseId) return { ok: false, error: "Bu tasarım bu kurs için değil." };
  const [e] = await db.select().from(enrollments).where(and(eq(enrollments.userId, studentId), eq(enrollments.courseId, courseId), eq(enrollments.status, "active"))).limit(1);
  if (!e) return { ok: false, error: "Öğrenci bu kursa kayıtlı değil." };
  if (t.rule.condition === "started" && !e.startedAt) return { ok: false, error: "Öğrenci kursu henüz başlatmadı." };
  if (t.rule.condition === "completed") {
    const p = await courseProgress(studentId, courseId);
    if (p.total === 0 || p.completed < p.total) return { ok: false, error: `Koşul sağlanmıyor: ${CERT_CONDITIONS.completed}.` };
  }
  const [[s], [c]] = await Promise.all([db.select().from(users).where(eq(users.id, studentId)).limit(1), db.select().from(courses).where(eq(courses.id, courseId)).limit(1)]);
  if (!s || !c) return { ok: false, error: "Kayıt bulunamadı." };
  const token = randomBytes(24).toString("hex");
  const holder = `${s.firstName} ${s.lastName}`.trim() || s.email;
  const r = await db.insert(issuedCertificates).values({ templateId, userId: studentId, courseId, holderName: holder, courseName: c.title, token, issuedBy: user.id }).onConflictDoNothing().returning({ id: issuedCertificates.id });
  if (!r[0]) return { ok: false, error: "Bu sertifika zaten verilmiş." };
  const url = `/sertifika/${token}`;
  await notifyUser(studentId, { title: "🎓 Sertifikan hazır", body: `${t.title} · ${c.title}`, url, tag: `cert-${templateId}-${courseId}` });
  await sendMail({ type: "certificate", to: s.email, subject: `Sertifikan hazır: ${c.title}`, html: emailTemplate({ title: "Tebrikler! 🎓", html: `<p><b>${c.title}</b> programı için <b>${t.title}</b> belgen hazır.</p>`, buttonText: "Sertifikayı gör", buttonUrl: siteUrl(url) }) });
  revalidatePath("/egitmen/sertifika");
  return { ok: true, url };
}

export async function revokeCertificate(id: number): Promise<ActionResult> {
  const user = await requireTeacher();
  const [ic] = await db.select().from(issuedCertificates).where(eq(issuedCertificates.id, id)).limit(1);
  if (!ic || !(await ownsCourse(user, ic.courseId))) return { ok: false, error: "Yetki yok." };
  await db.delete(issuedCertificates).where(eq(issuedCertificates.id, id));
  revalidatePath("/egitmen/sertifika");
  return { ok: true };
}

/** Duyuru (süper eğitmen/admin): all | students | teachers | <courseId> */
export async function announce(title: string, body: string, url: string, target: string): Promise<ActionResult> {
  const user = await requireTeacher();
  if (!user.isSuperTeacher) return { ok: false, error: "Yalnızca süper eğitmen duyuru gönderebilir." };
  if (!title.trim() || !body.trim()) return { ok: false, error: "Başlık ve metin gerekli." };
  let ids: number[] = [];
  let label = target;
  if (target === "teachers") {
    ids = (await db.select({ id: users.id }).from(users).where(eq(users.role, "teacher"))).map((r) => r.id);
    label = "Eğitmenler";
  } else if (target === "students" || target === "all") {
    const scope = user.role === "admin" ? undefined : await teacherCourseIds(user);
    const rows = scope && scope.length === 0 ? [] : await db.selectDistinct({ id: enrollments.userId }).from(enrollments).where(scope ? and(eq(enrollments.status, "active"), inArray(enrollments.courseId, scope)) : eq(enrollments.status, "active"));
    ids = rows.map((r) => r.id);
    if (target === "all") ids.push(...(await db.select({ id: users.id }).from(users).where(eq(users.role, "teacher"))).map((r) => r.id));
    label = target === "all" ? "Herkes" : "Öğrenciler";
  } else {
    const cid = Number(target);
    if (!(await ownsCourse(user, cid))) return { ok: false, error: "Yetki yok." };
    ids = (await db.select({ id: enrollments.userId }).from(enrollments).where(and(eq(enrollments.courseId, cid), eq(enrollments.status, "active")))).map((r) => r.id);
    const [c] = await db.select({ title: courses.title }).from(courses).where(eq(courses.id, cid)).limit(1);
    label = c?.title ?? `Kurs #${cid}`;
  }
  const n = await notifyUsers(ids, { title, body, url: url || "/panel", tag: `ann-${Date.now()}` });
  await logNotification({ channel: "push", title, body, target: label, sentCount: n, createdBy: user.id });
  revalidatePath("/egitmen/duyuru");
  return { ok: true, message: `${n} kişiye gönderildi.` };
}

export async function saveEvent(input: { id?: number; title: string; date: string; startTime: string; endTime: string; color: string; note: string }): Promise<ActionResult> {
  const user = await requireTeacher();
  if (!input.title.trim() || !input.date) return { ok: false, error: "Başlık ve tarih gerekli." };
  const v = { teacherId: user.id, title: input.title.trim(), eventDate: input.date, startTime: input.startTime || null, endTime: input.endTime || null, color: input.color || "#0b2a5e", note: input.note ?? "" };
  if (input.id) await db.update(teacherEvents).set(v).where(and(eq(teacherEvents.id, input.id), eq(teacherEvents.teacherId, user.id)));
  else await db.insert(teacherEvents).values(v);
  revalidatePath("/egitmen/takvim");
  return { ok: true };
}

export async function deleteEvent(id: number): Promise<ActionResult> {
  const user = await requireTeacher();
  await db.delete(teacherEvents).where(and(eq(teacherEvents.id, id), eq(teacherEvents.teacherId, user.id)));
  revalidatePath("/egitmen/takvim");
  return { ok: true };
}

/** Belge → kupon (süper eğitmen / admin) */
export async function issueCoupon(input: { docId?: number; email?: string; courseId: number; type: "student" | "graduate" | "custom"; amount?: number; expiryDays?: number }): Promise<ActionResult> {
  const user = await requireTeacher();
  if (!user.isSuperTeacher) return { ok: false, error: "Yetki yok." };
  let userId: number | null = null;
  if (input.docId) {
    const [d] = await db.select().from(documents).where(eq(documents.id, input.docId)).limit(1);
    if (!d) return { ok: false, error: "Belge bulunamadı." };
    userId = d.userId;
  } else if (input.email) {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email.trim().toLowerCase())).limit(1);
    if (!u) return { ok: false, error: "Bu e-posta ile kullanıcı yok." };
    userId = u.id;
  }
  if (!userId) return { ok: false, error: "Kullanıcı belirlenemedi." };
  const percent = input.type === "student" ? 90 : input.type === "graduate" ? 50 : Math.max(1, Math.min(100, Number(input.amount ?? 10)));
  const code = `FO${randomBytes(4).toString("hex").toUpperCase()}`;
  const expiresAt = input.expiryDays && input.expiryDays > 0 ? new Date(Date.now() + input.expiryDays * 86400000) : null;
  await db.insert(coupons).values({ code, percent, userId, courseId: input.courseId > 0 ? input.courseId : null, usageLimit: 1, expiresAt });
  if (input.docId) await db.update(documents).set({ status: "coupon_issued", couponCode: code, courseId: input.courseId }).where(eq(documents.id, input.docId));
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  await notifyUser(userId, { title: "🎁 İndirim kuponun hazır", body: `%${percent} indirim · ${code}`, url: "/panel/belge", tag: `coupon-${code}` });
  if (u) await sendMail({ type: "coupon", to: u.email, subject: "İndirim kuponun hazır", html: emailTemplate({ title: "İndirim kuponun hazır 🎁", html: `<p>%${percent} indirim kuponu: <b style="font-size:20px">${code}</b></p><p>Sepette kupon alanına yaz.${expiresAt ? ` Son kullanım: ${expiresAt.toLocaleDateString("tr-TR")}` : ""}</p>`, buttonText: "Programları gör", buttonUrl: siteUrl("/kesfet") }) });
  revalidatePath("/egitmen/belgeler"); revalidatePath("/admin/belgeler");
  return { ok: true, message: `Kupon oluşturuldu: ${code}` };
}

export async function deleteDocument(id: number): Promise<ActionResult> {
  const user = await requireTeacher();
  if (!user.isSuperTeacher) return { ok: false, error: "Yetki yok." };
  await db.delete(documents).where(eq(documents.id, id));
  revalidatePath("/egitmen/belgeler"); revalidatePath("/admin/belgeler");
  return { ok: true };
}

export async function rejectDocument(id: number): Promise<ActionResult> {
  const user = await requireTeacher();
  if (!user.isSuperTeacher) return { ok: false, error: "Yetki yok." };
  await db.update(documents).set({ status: "rejected" }).where(eq(documents.id, id));
  revalidatePath("/egitmen/belgeler"); revalidatePath("/admin/belgeler");
  return { ok: true };
}

/** Dönem oturumları güncellendi bildirimi */
export async function notifyPeriodStudents(periodId: number): Promise<ActionResult> {
  const user = await requireTeacher();
  const [p] = await db.select().from(periods).where(eq(periods.id, periodId)).limit(1);
  if (!p || !(await ownsCourse(user, p.courseId))) return { ok: false, error: "Yetki yok." };
  const ids = (await db.select({ id: periodEnrollments.userId }).from(periodEnrollments).where(eq(periodEnrollments.periodId, periodId))).map((r) => r.id);
  const next = (p.schedule ?? []).find((s) => s.date >= new Date().toISOString().slice(0, 10) && s.link);
  const n = await notifyUsers(ids, { title: "📅 Ders programı güncellendi", body: next ? `${next.date} ${next.time} ${next.title}` : p.name, url: next?.link || "/panel/takvim", tag: `period-${periodId}` });
  return { ok: true, message: `${n} öğrenciye bildirildi.` };
}


export async function saveTranscript(submissionId: number, index: number, text: string): Promise<ActionResult> {
  const user = await requireTeacher();
  const [row] = await db.select({ s: assignmentSubmissions, a: assignments }).from(assignmentSubmissions).innerJoin(assignments, eq(assignmentSubmissions.assignmentId, assignments.id)).where(eq(assignmentSubmissions.id, submissionId)).limit(1);
  if (!row || !(await ownsCourse(user, row.a.courseId))) return { ok: false, error: "Yetki yok." };
  await db.update(assignmentSubmissions).set({ voiceTranscript: { ...row.s.voiceTranscript, [String(index)]: text.slice(0, 20000) } }).where(eq(assignmentSubmissions.id, submissionId));
  return { ok: true };
}

/** Sohbeti sil (yalnızca admin) */
export async function deleteThread(studentId: number, courseId: number): Promise<ActionResult> {
  const user = await requireTeacher();
  if (user.role !== "admin") return { ok: false, error: "Yalnızca yönetici silebilir." };
  await db.delete(questions).where(and(eq(questions.userId, studentId), eq(questions.courseId, courseId)));
  revalidatePath("/egitmen/sorular"); revalidatePath("/admin/sorular");
  return { ok: true };
}

export async function markThreadRead(studentId: number, courseId: number): Promise<ActionResult> {
  const user = await requireTeacher();
  if (!(await ownsCourse(user, courseId))) return { ok: false, error: "Yetki yok." };
  await db.update(questions).set({ status: "answered" }).where(and(eq(questions.userId, studentId), eq(questions.courseId, courseId), eq(questions.status, "pending")));
  revalidatePath("/egitmen/sorular");
  return { ok: true };
}
