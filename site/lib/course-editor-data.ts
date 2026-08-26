import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { quizzes, quizQuestions, instructors, assignments, courseRelations } from "@/db/schema";
import { getCourseFull } from "@/lib/data/courses";
import type { CourseInput } from "@/lib/course-save";

export type EditorLesson = CourseInput["modules"][number]["lessons"][number];

const pad2 = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Mutlak teslim tarihini form alanlarına böler; 23:59 = "saat girilmemiş" */
function splitDue(v: Date | null | undefined): { dueDate: string; dueTime: string } {
  if (!v) return { dueDate: "", dueTime: "" };
  const d = new Date(v);
  const timeless = d.getHours() === 23 && d.getMinutes() === 59;
  return { dueDate: isoDate(d), dueTime: timeless ? "" : `${pad2(d.getHours())}:${pad2(d.getMinutes())}` };
}

/** Editörün beklediği form verisi: kurs + modüller + dersler + inline sınav soruları + dönemler */
export async function loadCourseForEditor(courseId: number): Promise<(CourseInput & { periodEnrolled: Record<number, number> }) | null> {
  const c = await getCourseFull(courseId);
  if (!c) return null;
  const quizLessonIds = c.flatLessons.filter((l) => l.type === "quiz").map((l) => l.id);
  const qz = quizLessonIds.length ? await db.select().from(quizzes).where(inArray(quizzes.lessonId, quizLessonIds)) : [];
  const qs = qz.length ? await db.select().from(quizQuestions).where(inArray(quizQuestions.quizId, qz.map((q) => q.id))).orderBy(quizQuestions.sortOrder, quizQuestions.id) : [];
  const asgLessonIds = c.flatLessons.filter((l) => l.type === "assign").map((l) => l.id);
  const asgs = asgLessonIds.length ? await db.select().from(assignments).where(inArray(assignments.lessonId, asgLessonIds)) : [];
  // Takvimli kursta tarih önerisi için en erken dönem (eski göreli günlü kayıtlar tarihe çevrilerek gösterilir)
  const firstPeriod = [...c.periods].sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const rels = await db.select().from(courseRelations).where(eq(courseRelations.courseId, courseId)).orderBy(courseRelations.sortOrder, courseRelations.id);

  return {
    id: c.id,
    title: c.title,
    shortDescription: c.shortDescription,
    description: c.description,
    imageUrl: c.imageUrl,
    status: c.status,
    isFree: c.isFree,
    price: Number(c.price),
    salePrice: Number(c.salePrice ?? 0),
    saleTo: c.saleTo ?? "",
    outcomes: c.outcomes,
    requirements: c.requirements,
    target: c.target,
    previewVideo: c.previewVideo,
    level: c.level,
    language: c.language,
    hasCertificate: c.hasCertificate,
    lifetime: c.lifetime,
    buttonType: c.buttonType,
    instructorId: c.instructorId,
    featured: c.featured,
    closed: c.closed,
    whatsappNumber: c.whatsappNumber,
    whatsappMessage: c.whatsappMessage,
    modules: c.modules.map((m) => ({
      id: m.id,
      title: m.title,
      lessons: m.lessons.map((l) => {
        const q = l.type === "quiz" ? qz.find((x) => x.lessonId === l.id) : undefined;
        const a = l.type === "assign" ? asgs.find((x) => x.lessonId === l.id) : undefined;
        let due = splitDue(q?.endDate ?? a?.dueDate ?? null);
        if (!due.dueDate && firstPeriod && l.dueDays > 0 && (l.type === "quiz" || l.type === "assign")) {
          const d = new Date(`${firstPeriod.startDate}T00:00:00`);
          d.setDate(d.getDate() + l.dueDays);
          due = { dueDate: isoDate(d), dueTime: firstPeriod.startTime ? firstPeriod.startTime.slice(0, 5) : "" };
        }
        return {
          id: l.id,
          type: l.type,
          title: l.title,
          videoUrl: l.videoUrl,
          duration: l.duration,
          preview: l.preview,
          description: l.description,
          dueDays: l.dueDays,
          dueDate: due.dueDate,
          dueTime: due.dueTime,
          fileUrl: l.fileUrl,
          fileName: l.fileName,
          fileMime: l.fileMime,
          timeLimit: q?.timeLimit ?? 0,
          passScore: q?.passScore ?? 0,
          maxAttempts: q?.maxAttempts ?? 1,
          shuffleQuestions: q?.shuffleQuestions ?? false,
          showCorrectAnswers: q?.showCorrectAnswers ?? true,
          isGraded: a?.isGraded ?? false,
          maxScore: a?.maxScore || 100,
          allowFile: a?.allowFile ?? true,
          allowVoice: a?.allowVoice ?? true,
          allowText: a?.allowText ?? true,
          questions: q
            ? qs.filter((x) => x.quizId === q.id).map((x) => ({
                id: x.id,
                qtype: x.type,
                text: x.text,
                points: x.points,
                options: x.options,
                correct: x.type === "true_false" ? (String(x.correct) === "false" ? "false" : "true") : Array.isArray(x.correct) ? (x.correct[0] ?? 0) : 0,
                explanation: x.explanation,
                image: x.image,
              }))
            : [],
        };
      }),
    })),
    periods: c.periods.map((p) => ({
      id: p.id,
      name: p.name,
      startDate: p.startDate,
      startTime: p.startTime ? p.startTime.slice(0, 5) : "",
      endDate: p.endDate,
      capacity: p.capacity,
      description: p.description,
      schedule: (p.schedule ?? []).map((s) => ({ date: s.date, time: s.time ?? "", title: s.title ?? "", link: s.link ?? "", notes: s.notes ?? "" })),
    })),
    relations: rels.map((r) => ({ relatedCourseId: r.relatedCourseId, trigger: r.trigger as "completed" | "purchased", discountPercent: r.discountPercent, note: r.note })),
    periodEnrolled: Object.fromEntries(c.periods.map((p) => [p.id, p.enrolled])),
  };
}

export async function listInstructors() {
  return db.select().from(instructors).where(eq(instructors.active, true)).orderBy(instructors.name);
}

/** İlişkili kurs seçimi için kısa kurs listesi (admin) */
export async function listCoursesBrief() {
  const { courses } = await import("@/db/schema");
  return db.select({ id: courses.id, title: courses.title }).from(courses).orderBy(courses.title);
}

export const EMPTY_COURSE: CourseInput = {
  title: "",
  shortDescription: "",
  description: "",
  imageUrl: "",
  status: "draft",
  isFree: false,
  price: 0,
  salePrice: 0,
  saleTo: "",
  outcomes: [],
  requirements: "",
  target: "",
  previewVideo: "",
  level: "all",
  language: "Türkçe",
  hasCertificate: false,
  lifetime: true,
  buttonType: "cart",
  modules: [],
  periods: [],
};
