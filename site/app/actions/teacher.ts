"use server";

import { couponLabel } from "@/lib/coupon-label";
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
import { parseCourseInput, checkCourseAgainstStored, courseLockInfo, saveCourse, duplicateCourse as dup } from "@/lib/course-save";
import { notifyWaitlistIfOpen } from "@/lib/waitlist";
import { saveUploadedFile, IMAGE_EXTENSIONS, slugify } from "@/lib/uploads";
import { notifyUser, notifyUsers, logNotification } from "@/lib/notify";
import { sendMail, emailTemplate, siteUrl, escapeHtml } from "@/lib/mailer";
import { safeInternalPath } from "@/lib/safe-path";
import { grantCertificate } from "@/lib/cert-issue";
import { todayISO } from "@/lib/format";
import { isUniqueViolation, isNumericError } from "@/lib/db-errors";
import { LIMITS, COUPON_MAX_AMOUNT, COUPON_MAX_DAYS } from "@/lib/limits";

export type ActionResult = { ok: true; message?: string; id?: number; url?: string } | { ok: false; error: string };

export async function saveCourseAction(raw: unknown): Promise<ActionResult> {
  const user = await requireTeacher();
  const isAdmin = user.role === "admin";
  // Kilit durumu doğrulamadan ÖNCE kayıttan okunur: kilitli alanlar (müfredat, dönemler, tür, durum, satış düğmesi)
  // istekten değil kayıttan alınır, elle gönderilen istekle aşılamaz (bkz. parseCourseInput)
  const rawId = typeof raw === "object" && raw !== null ? (raw as { id?: unknown }).id : undefined;
  let stored: Awaited<ReturnType<typeof courseLockInfo>> = null;
  if (rawId !== undefined && rawId !== null) {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Kurs bulunamadı." };
    if (!(await ownsCourse(user, id))) return { ok: false, error: "Bu kursa erişim yetkin yok." };
    stored = await courseLockInfo(id);
    if (!stored) return { ok: false, error: "Kurs bulunamadı." };
  }
  const parsed = parseCourseInput(raw, { isAdmin, stored });
  if (!parsed.ok) return parsed;
  const { input, locked } = parsed;
  if (!locked) {
    const err = await checkCourseAgainstStored(input);
    if (err) return { ok: false, error: err };
  }
  const prof = await ensureInstructorProfile(user);
  const r = await saveCourse(input, { authorId: user.id, instructorId: isAdmin ? (input.instructorId ?? null) : prof.id, locked, isAdmin, links: parsed.links });
  // Yayındaki kursa yeni sınav/görev eklendiyse kayıtlı öğrencilere haber ver
  if (input.status === "published" && (r.created.quizzes.length || r.created.assignments.length)) {
    const studs = await db.select({ id: users.id, email: users.email }).from(enrollments).innerJoin(users, eq(enrollments.userId, users.id)).where(and(eq(enrollments.courseId, r.courseId), eq(enrollments.status, "active")));
    const ids = studs.map((s) => s.id);
    for (const q of r.created.quizzes) {
      await notifyUsers(ids, { title: "Yeni sınav", body: `${q.title} · ${input.title}`, url: `/kurs-izle/${r.courseId}?quiz=${q.id}`, tag: `qz-${q.id}` });
      for (const st of studs) await sendMail({ type: "new_quiz", to: st.email, subject: `Yeni sınav: ${q.title}`, html: emailTemplate({ title: "Yeni sınav atandı", html: `<p><b>${escapeHtml(input.title)}</b> programına <b>${escapeHtml(q.title)}</b> sınavı eklendi.</p>`, buttonText: "Sınava git", buttonUrl: siteUrl(`/kurs-izle/${r.courseId}?quiz=${q.id}`) }) });
    }
    for (const a of r.created.assignments) {
      await notifyUsers(ids, { title: "Yeni görev", body: `${a.title} · ${input.title}`, url: `/kurs-izle/${r.courseId}?gorev=${a.id}`, tag: `asg-${a.id}` });
      for (const st of studs) await sendMail({ type: "new_assignment", to: st.email, subject: `Yeni görev: ${a.title}`, html: emailTemplate({ title: "Yeni görev atandı", html: `<p><b>${escapeHtml(input.title)}</b> programına <b>${escapeHtml(a.title)}</b> görevi eklendi.</p>`, buttonText: "Göreve git", buttonUrl: siteUrl(`/kurs-izle/${r.courseId}?gorev=${a.id}`) }) });
    }
  }
  revalidatePath("/egitmen"); revalidatePath("/kesfet"); revalidatePath("/");
  return { ok: true, id: r.courseId, url: `/program/${r.slug}`, message: locked ? "Değişiklikler kaydedildi (müfredat ve dönemler kilitli, korunuyor)." : input.status === "published" ? "Kaydedildi (yayında)." : "Taslak olarak kaydedildi." };
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
  if (!closed) await notifyWaitlistIfOpen(courseId);
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
  await notifyUser(studentId, { title: `Sorun yanıtlandı: ${c?.title ?? ""}`, body: t.slice(0, 100), url, tag: `qa-${courseId}` });
  if (s) {
    await sendMail({ type: "question_answered", to: s.email, subject: "Sorun cevaplandı", html: emailTemplate({ title: "Sorun cevaplandı", html: `<p><b>${escapeHtml(c?.title)}</b> programındaki sorun yanıtlandı:</p><blockquote style="white-space:pre-line">${escapeHtml(t)}</blockquote>`, buttonText: "Cevabı gör", buttonUrl: siteUrl(url) }) });
  }
  revalidatePath("/egitmen/sorular");
  return { ok: true };
}

export async function quizAttemptDetail(attemptId: number) {
  const user = await requireTeacher();
  const [row] = await db.select({ at: quizAttempts, q: quizzes, u: users }).from(quizAttempts).innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id)).innerJoin(users, eq(quizAttempts.userId, users.id)).where(eq(quizAttempts.id, attemptId)).limit(1);
  if (!row || !(await ownsCourse(user, row.q.courseId))) return null;
  const qs = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, row.q.id)).orderBy(quizQuestions.sortOrder, quizQuestions.id);
  return {
    id: row.at.id, title: row.q.title, student: `${row.u.firstName} ${row.u.lastName}`.trim(), status: row.at.status, score: row.at.score ? Number(row.at.score) : null,
    feedback: row.at.feedback,
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
  // Elle verme her zaman mümkündür: tasarımın koşulu (kayıt/başlatma/bitirme) yalnızca OTOMATİK vermeyi ve ekrandaki
  // uyarıyı belirler. Koşul sağlanmamışsa eğitmen ekranda uyarılır, kararı kendisi verir.
  const r = await grantCertificate({ templateId, userId: studentId, courseId, issuedBy: user.id });
  if (!r.ok) return r;
  revalidatePath("/egitmen/sertifika");
  return { ok: true, url: r.url };
}

export async function revokeCertificate(id: number): Promise<ActionResult> {
  const user = await requireTeacher();
  const [ic] = await db.select().from(issuedCertificates).where(eq(issuedCertificates.id, id)).limit(1);
  if (!ic || !(await ownsCourse(user, ic.courseId))) return { ok: false, error: "Yetki yok." };
  await db.delete(issuedCertificates).where(eq(issuedCertificates.id, id));
  revalidatePath("/egitmen/sertifika");
  return { ok: true };
}

/** Duyuru bağlantısını doğrular: boş → /panel; geçersizse null */
function announceLink(raw: string): string | null {
  const v = (raw ?? "").trim();
  if (!v) return "/panel";
  if (v.length > 500) return null;
  if (v.startsWith("/")) return safeInternalPath(v, "") || null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !!u.hostname ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Duyuru (süper eğitmen/admin): all | students | teachers | <courseId> */
export async function announce(title: string, body: string, url: string, target: string): Promise<ActionResult> {
  const user = await requireTeacher();
  if (!user.isSuperTeacher) return { ok: false, error: "Yalnızca süper eğitmen duyuru gönderebilir." };
  if (!title.trim() || !body.trim()) return { ok: false, error: "Başlık ve metin gerekli." };
  if (title.length > 150) return { ok: false, error: "Başlık en fazla 150 karakter olabilir." };
  if (body.length > 1000) return { ok: false, error: "Mesaj en fazla 1.000 karakter olabilir." };
  // Bağlantı: site içi yol ("/panel/…") ya da https:// ile başlayan adres; javascript:, http:, //site gibi değerler reddedilir
  const link = announceLink(url);
  if (link === null) return { ok: false, error: "Bağlantı site içi bir yol (örnek: /panel/egitim) ya da https:// ile başlayan bir adres olmalı." };
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
  const n = await notifyUsers(ids, { title: title.trim(), body: body.trim(), url: link, tag: `ann-${Date.now()}` });
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

/**
 * Belge → kupon (süper eğitmen / admin).
 * Bir belgenin tek geçerli kuponu olur: belgeye daha önce kupon verildiyse `replace` olmadan yeni kupon verilmez.
 * `replace: true` ile eski kupon (hiç kullanılmadıysa) silinir ve yenisi verilir; eski kupon kullanıldıysa ya da
 * bekleyen bir siparişte ayrıldıysa belgeye yeni kupon verilemez.
 */
export async function issueCoupon(input: { docId?: number; email?: string; courseId: number; type: "student" | "graduate" | "custom" | "fixed"; amount?: number; expiryDays?: number; replace?: boolean }): Promise<ActionResult> {
  const user = await requireTeacher();
  if (!user.isSuperTeacher) return { ok: false, error: "Yetki yok." };
  if (!["student", "graduate", "custom", "fixed"].includes(input.type)) return { ok: false, error: "Geçersiz indirim türü." };
  let userId: number | null = null;
  let oldCode: string | null = null;
  if (input.docId) {
    const [d] = await db.select().from(documents).where(eq(documents.id, input.docId)).limit(1);
    if (!d) return { ok: false, error: "Belge bulunamadı." };
    userId = d.userId;
    if (d.couponCode) {
      const [old] = await db.select({ code: coupons.code, usedCount: coupons.usedCount }).from(coupons).where(eq(coupons.code, d.couponCode)).limit(1);
      if (old) {
        if (old.usedCount > 0) return { ok: false, error: `Bu belgeye verilen kupon (${old.code}) kullanılmış ya da bekleyen bir siparişte ayrılmış; belgeye yeni kupon verilemez. Ek indirim gerekiyorsa "Doğrudan kupon tanımla" bölümünü kullan.` };
        if (!input.replace) return { ok: false, error: `Bu belgeye zaten kupon verildi: ${old.code}. Yeni kupon vermek için önce eskisinin iptalini onaylaman gerekir.` };
        oldCode = old.code;
      }
    }
  } else if (input.email) {
    const email = String(input.email).trim().toLowerCase();
    if (email.length > LIMITS.email) return { ok: false, error: `E-posta en fazla ${LIMITS.email} karakter olabilir.` };
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (!u) return { ok: false, error: "Bu e-posta ile kullanıcı yok." };
    userId = u.id;
  } else return { ok: false, error: "E-posta gerekli." };
  if (!userId) return { ok: false, error: "Kullanıcı belirlenemedi." };
  // fixed: sabit tutar (TL); diğerleri yüzde
  const rawAmount = Number(input.amount ?? 0);
  const fixedAmount = input.type === "fixed" ? Math.round(rawAmount * 100) / 100 : 0;
  if (input.type === "fixed" && (!Number.isFinite(rawAmount) || fixedAmount <= 0)) return { ok: false, error: "Sabit tutar 0'dan büyük olmalı." };
  if (fixedAmount > COUPON_MAX_AMOUNT) return { ok: false, error: `Sabit tutar en fazla ${COUPON_MAX_AMOUNT.toLocaleString("tr-TR")} TL olabilir.` };
  if (input.type === "custom" && (!Number.isInteger(rawAmount) || rawAmount < 1 || rawAmount > 100)) return { ok: false, error: "Yüzde 1 ile 100 arasında tam sayı olmalı (ondalık yazılamaz; örneğin 12.5 yerine 12 ya da 13)." };
  const percent = input.type === "fixed" ? 0 : input.type === "student" ? 90 : input.type === "graduate" ? 50 : rawAmount;
  const days = input.expiryDays === undefined || input.expiryDays === null ? 0 : Number(input.expiryDays);
  if (!Number.isInteger(days) || days < 0 || days > COUPON_MAX_DAYS) return { ok: false, error: `Geçerlilik süresi 0 ile ${COUPON_MAX_DAYS} gün arasında tam sayı olmalı (0 ya da boş = süresiz).` };
  const courseId = Number(input.courseId ?? 0);
  if (!Number.isInteger(courseId) || courseId < 0) return { ok: false, error: "Geçersiz eğitim seçimi." };
  if (courseId > 0) {
    const [c] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).limit(1);
    if (!c) return { ok: false, error: "Seçilen eğitim bulunamadı." };
  }
  const label = couponLabel({ percent, amount: fixedAmount });
  const code = `FO${randomBytes(4).toString("hex").toUpperCase()}`;
  const expiresAt = days > 0 ? new Date(Date.now() + days * 86400000) : null;
  try {
    const done = await db.transaction(async (tx) => {
      if (oldCode) {
        // Yalnızca hâlâ kullanılmamışsa silinir (arada kullanıldıysa işlem geri alınır)
        const gone = await tx.delete(coupons).where(and(eq(coupons.code, oldCode), eq(coupons.usedCount, 0))).returning({ id: coupons.id });
        if (gone.length === 0) return false;
      }
      await tx.insert(coupons).values({ code, percent, amount: fixedAmount > 0 ? fixedAmount.toFixed(2) : null, userId, courseId: courseId > 0 ? courseId : null, usageLimit: 1, expiresAt });
      if (input.docId) await tx.update(documents).set({ status: "coupon_issued", couponCode: code, courseId }).where(eq(documents.id, input.docId));
      return true;
    });
    if (!done) return { ok: false, error: `Eski kupon (${oldCode}) bu sırada kullanıldı; yeni kupon verilmedi.` };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "Kupon kodu çakıştı; tekrar dene." };
    if (isNumericError(e)) return { ok: false, error: "Girilen sayılardan biri çok büyük ya da geçersiz." };
    throw e;
  }
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const title = oldCode ? "İndirim kuponun yenilendi" : "İndirim kuponun hazır";
  const oldNote = oldCode ? ` Önceki kuponun (${oldCode}) artık geçerli değil.` : "";
  await notifyUser(userId, { title, body: `${label} · ${code}${oldNote}`, url: "/panel/kupon", tag: `coupon-${code}` });
  if (u) await sendMail({ type: "coupon", to: u.email, subject: title, html: emailTemplate({ title: `${title} 🎁`, html: `<p>${escapeHtml(label)} kuponu: <b style="font-size:20px">${escapeHtml(code)}</b></p><p>Sepette kupon alanına yaz.${expiresAt ? ` Son kullanım: ${expiresAt.toLocaleDateString("tr-TR")}` : ""}${escapeHtml(oldNote)}</p>`, buttonText: "Programları gör", buttonUrl: siteUrl("/kesfet") }) });
  revalidatePath("/egitmen/belgeler"); revalidatePath("/admin/belgeler"); revalidatePath("/admin/kuponlar"); revalidatePath("/panel/kupon"); revalidatePath("/panel/belge");
  return { ok: true, message: oldCode ? `Kupon yenilendi: ${code} (eski kupon ${oldCode} iptal edildi)` : `Kupon oluşturuldu: ${code}` };
}

export async function deleteDocument(id: number): Promise<ActionResult> {
  const user = await requireTeacher();
  if (!user.isSuperTeacher) return { ok: false, error: "Yetki yok." };
  const gone = await db.delete(documents).where(eq(documents.id, id)).returning({ id: documents.id });
  if (gone.length === 0) return { ok: false, error: "Belge bulunamadı (silinmiş olabilir)." };
  revalidatePath("/egitmen/belgeler"); revalidatePath("/admin/belgeler"); revalidatePath("/panel/belge");
  return { ok: true, message: "Belge silindi." };
}

/** Belge reddi: yalnızca bekleyen belge reddedilir; öğrenciye uygulama içi bildirim gider ("Belge & kupon" tercihi) */
export async function rejectDocument(id: number): Promise<ActionResult> {
  const user = await requireTeacher();
  if (!user.isSuperTeacher) return { ok: false, error: "Yetki yok." };
  const [d] = await db.update(documents).set({ status: "rejected" }).where(and(eq(documents.id, id), eq(documents.status, "pending"))).returning({ userId: documents.userId, fileName: documents.fileName });
  if (!d) return { ok: false, error: "Yalnızca bekleyen belge reddedilebilir (belge silinmiş ya da sonuçlanmış olabilir)." };
  await notifyUser(d.userId, {
    title: "Belgen onaylanmadı",
    body: `Yüklediğin belge${d.fileName ? ` (${d.fileName.slice(0, 80)})` : ""} indirim için uygun bulunmadı. Uygun bir belgeyle yeniden başvurabilirsin.`,
    url: "/panel/belge",
    tag: `coupon-red-${id}`,
  });
  revalidatePath("/egitmen/belgeler"); revalidatePath("/admin/belgeler"); revalidatePath("/panel/belge");
  return { ok: true, message: "Belge reddedildi; öğrenciye bildirim gönderildi." };
}

/** Dönem oturumları güncellendi bildirimi */
export async function notifyPeriodStudents(periodId: number): Promise<ActionResult> {
  const user = await requireTeacher();
  const [p] = await db.select().from(periods).where(eq(periods.id, periodId)).limit(1);
  if (!p || !(await ownsCourse(user, p.courseId))) return { ok: false, error: "Yetki yok." };
  const ids = (await db.select({ id: periodEnrollments.userId }).from(periodEnrollments).where(eq(periodEnrollments.periodId, periodId))).map((r) => r.id);
  const next = (p.schedule ?? []).find((s) => s.date >= todayISO() && s.link);
  const n = await notifyUsers(ids, { title: "Ders programı güncellendi", body: next ? `${next.date} ${next.time} ${next.title}` : p.name, url: next?.link || "/panel/takvim", tag: `period-${periodId}` });
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
