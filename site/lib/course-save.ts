import "server-only";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { courses, modules, lessons, quizzes, quizQuestions, assignments, periods, periodEnrollments, courseRelations } from "@/db/schema";
import { slugify } from "@/lib/uploads";
import { normalizeDuration } from "@/lib/course-logic";
import { todayISO } from "@/lib/format";

// Editörden gelen müfredat şeması — sınav soruları da inline gelir
const questionSchema = z.object({
  id: z.number().optional(),
  qtype: z.enum(["multiple_choice", "true_false", "open_ended"]),
  text: z.string().trim(),
  points: z.coerce.number().int().min(1).catch(1),
  options: z.array(z.string()).default([]),
  correct: z.union([z.number(), z.string(), z.boolean(), z.null()]).optional(),
  explanation: z.string().default(""),
  image: z.string().default(""),
});

const lessonSchema = z.object({
  id: z.number().optional(),
  type: z.enum(["video", "quiz", "assign", "file"]),
  title: z.string().trim(),
  videoUrl: z.string().trim().default(""),
  duration: z.string().default(""),
  preview: z.boolean().default(false),
  description: z.string().default(""),
  dueDays: z.coerce.number().int().min(0).catch(0),
  // Takvimli kursta teslim mutlak tarihle girilir (YYYY-MM-DD + isteğe bağlı HH:MM)
  dueDate: z.string().default(""),
  dueTime: z.string().default(""),
  fileUrl: z.string().default(""),
  fileName: z.string().default(""),
  fileMime: z.string().default(""),
  questions: z.array(questionSchema).default([]),
  timeLimit: z.coerce.number().int().min(0).catch(0),
  passScore: z.coerce.number().int().min(0).max(100).catch(0),
  maxAttempts: z.coerce.number().int().min(0).catch(1),
  shuffleQuestions: z.boolean().default(false),
  showCorrectAnswers: z.boolean().default(true),
  isGraded: z.boolean().default(false),
  maxScore: z.coerce.number().int().min(0).catch(100),
  allowFile: z.boolean().default(true),
  allowVoice: z.boolean().default(true),
  allowText: z.boolean().default(true),
});

const moduleSchema = z.object({
  id: z.number().optional(),
  title: z.string().trim(),
  lessons: z.array(lessonSchema).default([]),
});

const scheduleSchema = z.object({
  date: z.string(),
  time: z.string().default(""),
  title: z.string().default(""),
  link: z.string().default(""),
  notes: z.string().default(""),
});

// İlişkili kurs önerisi (yalnızca admin kaydeder)
const relationSchema = z.object({
  relatedCourseId: z.coerce.number().int().min(1),
  trigger: z.enum(["completed", "purchased"]).default("completed"),
  discountPercent: z.coerce.number().int().min(0).max(100).catch(0),
  note: z.string().default(""),
});

const periodSchema = z.object({
  id: z.number().optional(),
  name: z.string().trim(),
  startDate: z.string(),
  startTime: z.string().default(""),
  endDate: z.string(),
  capacity: z.coerce.number().int().min(1).catch(20),
  description: z.string().default(""),
  schedule: z.array(scheduleSchema).default([]),
});

const courseObjectSchema = z.object({
  id: z.number().optional(),
  title: z.string().trim().min(2, "Başlık gerekli."),
  shortDescription: z.string().default(""),
  description: z.string().default(""),
  imageUrl: z.string().default(""),
  status: z.enum(["draft", "published"]).default("draft"),
  isFree: z.boolean().default(false),
  price: z.coerce.number().min(0).catch(0),
  salePrice: z.coerce.number().min(0).catch(0),
  saleTo: z.string().default(""),
  outcomes: z.array(z.string()).default([]),
  requirements: z.string().default(""),
  target: z.string().default(""),
  previewVideo: z.string().default(""),
  level: z.string().default("all"),
  language: z.string().default("Türkçe"),
  hasCertificate: z.boolean().default(false),
  lifetime: z.boolean().default(true),
  buttonType: z.string().default("cart"),
  // Online görüşme ürünü: müfredat yok, koltuklar dönem olarak tutulur
  type: z.enum(["course", "meeting"]).default("course"),
  meetingMinutes: z.coerce.number().int().min(0).catch(0),
  meetingLink: z.string().trim().default(""),
  instructorId: z.number().nullable().optional(),
  modules: z.array(moduleSchema).default([]),
  periods: z.array(periodSchema).default([]),
  relations: z.array(relationSchema).optional(),
  featured: z.boolean().optional(),
  closed: z.boolean().optional(),
  whatsappNumber: z.string().optional(),
  whatsappMessage: z.string().optional(),
});

/**
 * Kurs tipi kuralları:
 * - Esnek/ücretsiz (dönemsiz) kursta görev olmaz.
 * - Sınavlar her kurs tipinde anlık geri bildirimlidir: test/D-Y otomatik değerlendirilir,
 *   açık uçlu sorular yalnızca kaydedilir (puanlanmaz, eğitmen değerlendirmesi yoktur).
 *   Açık uçlu ve test/D-Y sorular aynı sınavda birlikte yer alabilir.
 */
export const courseInputSchema = courseObjectSchema.superRefine((c, ctx) => {
  const scheduled = c.periods.filter((p) => p.name && p.startDate && p.endDate).length > 0;
  c.modules.forEach((m, mi) =>
    m.lessons.forEach((l, li) => {
      if (!scheduled && l.type === "assign") {
        ctx.addIssue({ code: "custom", path: ["modules", mi, "lessons", li, "type"], message: "görev yalnızca takvimli (dönemli) eğitimlerde olabilir" });
      }
      // Sınavlarda açık uçlu + test/D-Y karışık olabilir. Açık uçlu sorular puanlanmaz,
      // yalnızca kaydedilir; test/D-Y otomatik değerlendirilir.
    })
  );
});

export type CourseInput = z.infer<typeof courseObjectSchema>;

async function uniqueSlug(title: string, id?: number) {
  const base = slugify(title) || "program";
  let slug = base;
  for (let i = 2; i < 100; i++) {
    const [ex] = await db.select({ id: courses.id }).from(courses).where(eq(courses.slug, slug)).limit(1);
    if (!ex || ex.id === id) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Kursu ve tüm alt yapısını kaydeder.
 * locked=true (yayında + admin değil): müfredat ve dönemler dokunulmaz; yalnızca gelecek dönemlerin oturum linkleri güncellenir.
 */
export async function saveCourse(input: CourseInput, opts: { authorId: number; instructorId: number | null; locked: boolean; isAdmin: boolean }) {
  const isNew = !input.id;
  const slug = await uniqueSlug(input.title, input.id);
  const saleValid = input.salePrice > 0 && input.salePrice < input.price;
  const base = {
    title: input.title,
    slug,
    shortDescription: input.shortDescription,
    description: input.description,
    imageUrl: input.imageUrl,
    status: input.status,
    isFree: input.isFree,
    price: input.isFree ? "0" : input.price.toFixed(2),
    salePrice: input.isFree || !saleValid ? null : input.salePrice.toFixed(2),
    saleTo: saleValid && input.saleTo ? input.saleTo : null,
    outcomes: input.outcomes.map((o) => o.trim()).filter(Boolean),
    requirements: input.requirements,
    target: input.target,
    previewVideo: input.previewVideo,
    level: input.level,
    language: input.language,
    hasCertificate: input.hasCertificate,
    lifetime: input.lifetime,
    buttonType: input.buttonType,
    type: input.type,
    meetingMinutes: input.type === "meeting" ? input.meetingMinutes : 0,
    meetingLink: input.type === "meeting" ? input.meetingLink : "",
    updatedAt: new Date(),
    ...(opts.isAdmin && input.instructorId !== undefined ? { instructorId: input.instructorId } : {}),
    ...(opts.isAdmin && input.featured !== undefined ? { featured: input.featured } : {}),
    ...(opts.isAdmin && input.closed !== undefined ? { closed: input.closed } : {}),
    ...(opts.isAdmin && input.whatsappNumber !== undefined ? { whatsappNumber: input.whatsappNumber } : {}),
    ...(opts.isAdmin && input.whatsappMessage !== undefined ? { whatsappMessage: input.whatsappMessage } : {}),
  };

  let courseId: number;
  if (isNew) {
    const [c] = await db.insert(courses).values({ ...base, authorId: opts.authorId, instructorId: opts.instructorId }).returning({ id: courses.id });
    courseId = c.id;
  } else {
    courseId = input.id!;
    await db.update(courses).set(base).where(eq(courses.id, courseId));
  }

  let created: Created = { quizzes: [], assignments: [] };
  if (!opts.locked) {
    created = await syncCurriculum(courseId, input.type === "meeting" ? [] : input.modules, opts.authorId, input.periods.length > 0);
    await syncPeriods(courseId, input.periods, false, opts.isAdmin);
  } else {
    await syncPeriods(courseId, input.periods, true);
  }

  // İlişkili kurs önerileri (yalnızca admin düzenler)
  if (opts.isAdmin && input.relations !== undefined) {
    await db.delete(courseRelations).where(eq(courseRelations.courseId, courseId));
    const seenRel = new Set<string>();
    const rels = input.relations
      .filter((r) => r.relatedCourseId !== courseId)
      .filter((r) => { const k = `${r.relatedCourseId}-${r.trigger}`; if (seenRel.has(k)) return false; seenRel.add(k); return true; })
      .map((r, i) => ({ courseId, relatedCourseId: r.relatedCourseId, trigger: r.trigger, discountPercent: r.discountPercent, note: r.note.slice(0, 300), sortOrder: i }));
    if (rels.length) await db.insert(courseRelations).values(rels);
  }

  // Grup: dönem varsa takvimli, ücretsizse ucretsiz, değilse esnek
  const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(periods).where(eq(periods.courseId, courseId));
  const group = n > 0 ? "takvimli" : input.isFree ? "ucretsiz" : "esnek";
  await db.update(courses).set({ group }).where(eq(courses.id, courseId));
  return { courseId, slug, created };
}

export type Created = { quizzes: { id: number; title: string }[]; assignments: { id: number; title: string }[] };

async function syncCurriculum(courseId: number, mods: CourseInput["modules"], authorId: number, scheduled: boolean): Promise<Created> {
  const created: Created = { quizzes: [], assignments: [] };
  const keepModules: number[] = [];
  const keepLessons: number[] = [];
  let mi = 0;
  for (const m of mods) {
    if (!m.title) continue;
    let moduleId = m.id;
    if (moduleId) {
      const r = await db.update(modules).set({ title: m.title, sortOrder: mi }).where(and(eq(modules.id, moduleId), eq(modules.courseId, courseId))).returning({ id: modules.id });
      if (!r[0]) moduleId = undefined;
    }
    if (!moduleId) {
      const [c] = await db.insert(modules).values({ courseId, title: m.title, sortOrder: mi }).returning({ id: modules.id });
      moduleId = c.id;
    }
    keepModules.push(moduleId);
    mi++;
    let li = 0;
    for (const l of m.lessons) {
      const isTask = l.type === "quiz" || l.type === "assign";
      // Takvimli kursta mutlak teslim tarihi; saat boşsa günün sonu (23:59:59).
      // Tarih girilmemişse eski göreli gün değeri (dueDays) geçerli kalır.
      const dueAt = scheduled && isTask && /^\d{4}-\d{2}-\d{2}$/.test(l.dueDate)
        ? new Date(`${l.dueDate}T${/^\d{1,2}:\d{2}$/.test(l.dueTime) ? `${l.dueTime}:00` : "23:59:59"}`)
        : null;
      const values = {
        courseId, moduleId, type: l.type, title: l.title || (l.type === "video" ? "Ders" : l.type === "quiz" ? "Sınav" : l.type === "assign" ? "Görev" : l.fileName || "Dosya"),
        sortOrder: li, videoUrl: l.type === "video" ? l.videoUrl : "", duration: l.type === "video" ? normalizeDuration(l.duration) : "",
        preview: l.type === "video" ? l.preview : false, description: l.description, dueDays: isTask && !dueAt ? l.dueDays : 0,
        fileUrl: l.type === "file" ? l.fileUrl : "", fileName: l.type === "file" ? l.fileName : "", fileMime: l.type === "file" ? l.fileMime : "",
      };
      let lessonId = l.id;
      if (lessonId) {
        const r = await db.update(lessons).set(values).where(and(eq(lessons.id, lessonId), eq(lessons.courseId, courseId))).returning({ id: lessons.id });
        if (!r[0]) lessonId = undefined;
      }
      if (!lessonId) {
        const [c] = await db.insert(lessons).values(values).returning({ id: lessons.id });
        lessonId = c.id;
      }
      keepLessons.push(lessonId);
      li++;

      if (l.type === "quiz") {
        const [existing] = await db.select().from(quizzes).where(eq(quizzes.lessonId, lessonId)).limit(1);
        const qv = { courseId, lessonId, title: values.title, description: l.description, timeLimit: l.timeLimit, passScore: l.passScore, maxAttempts: l.maxAttempts, shuffleQuestions: l.shuffleQuestions, showCorrectAnswers: l.showCorrectAnswers, extraDays: dueAt ? null : l.dueDays > 0 ? l.dueDays : null, endDate: dueAt, status: "active" as const };
        let quizId = existing?.id;
        if (quizId) await db.update(quizzes).set(qv).where(eq(quizzes.id, quizId));
        else { const [c] = await db.insert(quizzes).values(qv).returning({ id: quizzes.id }); quizId = c.id; created.quizzes.push({ id: quizId, title: values.title }); }
        // Sorular: id'si olanlar güncellenir, yeni olanlar eklenir, gelmeyenler silinir
        const keepQ: number[] = [];
        let qi = 0;
        for (const q of l.questions) {
          if (!q.text) continue;
          const correct = q.qtype === "multiple_choice" ? [Number(q.correct ?? 0) || 0] : q.qtype === "true_false" ? (q.correct === false || q.correct === "false" ? "false" : "true") : null;
          const options = q.qtype === "multiple_choice" ? q.options.filter((o) => o.trim() !== "") : q.qtype === "true_false" ? ["Doğru", "Yanlış"] : [];
          const row = { quizId, type: q.qtype, text: q.text, options, correct, points: q.points, explanation: q.explanation, image: q.image ?? "", sortOrder: qi++ };
          let qid = q.id;
          if (qid) {
            const r = await db.update(quizQuestions).set(row).where(and(eq(quizQuestions.id, qid), eq(quizQuestions.quizId, quizId))).returning({ id: quizQuestions.id });
            if (!r[0]) qid = undefined;
          }
          if (!qid) { const [c] = await db.insert(quizQuestions).values(row).returning({ id: quizQuestions.id }); qid = c.id; }
          keepQ.push(qid);
        }
        if (keepQ.length) await db.delete(quizQuestions).where(and(eq(quizQuestions.quizId, quizId), notInArray(quizQuestions.id, keepQ)));
        else await db.delete(quizQuestions).where(eq(quizQuestions.quizId, quizId));
      }
      if (l.type === "assign") {
        const [existing] = await db.select().from(assignments).where(eq(assignments.lessonId, lessonId)).limit(1);
        const av = { courseId, lessonId, title: values.title, description: l.description, extraDays: dueAt ? 0 : l.dueDays, dueDate: dueAt, status: "active", isGraded: l.isGraded, maxScore: l.isGraded ? l.maxScore : 0, allowFile: l.allowFile, allowVoice: l.allowVoice, allowText: l.allowText };
        if (existing) await db.update(assignments).set(av).where(eq(assignments.id, existing.id));
        else { const [c] = await db.insert(assignments).values({ ...av, createdBy: authorId }).returning({ id: assignments.id }); created.assignments.push({ id: c.id, title: values.title }); }
      }
    }
  }
  // Silinenler
  if (keepLessons.length) await db.delete(lessons).where(and(eq(lessons.courseId, courseId), notInArray(lessons.id, keepLessons)));
  else await db.delete(lessons).where(eq(lessons.courseId, courseId));
  if (keepModules.length) await db.delete(modules).where(and(eq(modules.courseId, courseId), notInArray(modules.id, keepModules)));
  else await db.delete(modules).where(eq(modules.courseId, courseId));
  // Dersi silinen sınav/görevleri pasifleştir
  await db.update(quizzes).set({ status: "deleted" }).where(and(eq(quizzes.courseId, courseId), sql`${quizzes.lessonId} is null`));
  await db.update(assignments).set({ status: "deleted" }).where(and(eq(assignments.courseId, courseId), sql`${assignments.lessonId} is null`));
  return created;
}

async function syncPeriods(courseId: number, list: CourseInput["periods"], lockedMode: boolean, force = false) {
  const existing = await db.select().from(periods).where(eq(periods.courseId, courseId));
  const today = todayISO();
  const keep: number[] = [];
  for (const p of list) {
    if (!p.name || !p.startDate || !p.endDate) continue;
    const schedule = p.schedule.filter((s) => s.date).map((s) => ({ date: s.date, time: s.time, title: s.title, link: s.link, notes: s.notes ?? "" }));
    const ex = p.id ? existing.find((e) => e.id === p.id) : undefined;
    if (lockedMode) {
      // Yalnızca gelecek dönemlerin oturum linkleri
      if (!ex || ex.endDate < today) { if (ex) keep.push(ex.id); continue; }
      const merged = (ex.schedule ?? []).map((s, i) => ({ ...s, link: schedule[i]?.link ?? s.link }));
      await db.update(periods).set({ schedule: merged }).where(eq(periods.id, ex.id));
      keep.push(ex.id);
      continue;
    }
    const startTime = /^\d{1,2}:\d{2}$/.test(p.startTime) ? p.startTime : null;
    const deadline = new Date(`${p.startDate}T00:00:00`); deadline.setDate(deadline.getDate() - 1);
    const values = {
      courseId, name: p.name, startDate: p.startDate, startTime, endDate: p.endDate, capacity: p.capacity, description: p.description, schedule,
      enrollmentDeadline: deadline.toISOString().slice(0, 10),
    };
    if (ex) { await db.update(periods).set(values).where(eq(periods.id, ex.id)); keep.push(ex.id); }
    else { const [c] = await db.insert(periods).values(values).returning({ id: periods.id }); keep.push(c.id); }
  }
  if (!lockedMode) {
    // Gönderilmeyen dönemler: kayıt yoksa sil
    for (const e of existing) {
      if (keep.includes(e.id)) continue;
      const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(periodEnrollments).where(eq(periodEnrollments.periodId, e.id));
      // Kayıtlı öğrenci varsa yalnızca yönetici silebilir (dönem kayıtları da silinir; kurs kaydı kalır)
      if (n === 0 || force) await db.delete(periods).where(eq(periods.id, e.id));
    }
  }
}

export async function duplicateCourse(courseId: number) {
  const [c] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c) return null;
  const slug = await uniqueSlug(`${c.title} (Kopya)`);
  const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = c;
  void _id; void _ca; void _ua;
  const [n] = await db.insert(courses).values({ ...rest, slug, title: `${c.title} (Kopya)`, status: "draft", closed: false, group: c.isFree ? "ucretsiz" : "esnek", featured: false }).returning({ id: courses.id });
  const mods = await db.select().from(modules).where(eq(modules.courseId, courseId)).orderBy(modules.sortOrder);
  const ls = await db.select().from(lessons).where(eq(lessons.courseId, courseId)).orderBy(lessons.sortOrder);
  for (const m of mods) {
    const [nm] = await db.insert(modules).values({ courseId: n.id, title: m.title, sortOrder: m.sortOrder }).returning({ id: modules.id });
    for (const l of ls.filter((x) => x.moduleId === m.id)) {
      const { id: lid, ...lrest } = l;
      const [nl] = await db.insert(lessons).values({ ...lrest, courseId: n.id, moduleId: nm.id }).returning({ id: lessons.id });
      if (l.type === "quiz") {
        const [q] = await db.select().from(quizzes).where(eq(quizzes.lessonId, lid)).limit(1);
        if (q) {
          const { id: qid, ...qrest } = q;
          const [nq] = await db.insert(quizzes).values({ ...qrest, courseId: n.id, lessonId: nl.id }).returning({ id: quizzes.id });
          const qs = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, qid));
          if (qs.length) await db.insert(quizQuestions).values(qs.map(({ id: _q, ...r }) => { void _q; return { ...r, quizId: nq.id }; }));
        }
      }
      if (l.type === "assign") {
        const [a] = await db.select().from(assignments).where(eq(assignments.lessonId, lid)).limit(1);
        if (a) { const { id: _a, ...arest } = a; void _a; await db.insert(assignments).values({ ...arest, courseId: n.id, lessonId: nl.id, periodId: null }); }
      }
    }
  }
  return n.id;
}

