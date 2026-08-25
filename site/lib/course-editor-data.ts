import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { quizzes, quizQuestions, instructors, assignments } from "@/db/schema";
import { getCourseFull } from "@/lib/data/courses";
import type { CourseInput } from "@/lib/course-save";

export type EditorLesson = CourseInput["modules"][number]["lessons"][number];

/** Editörün beklediği form verisi: kurs + modüller + dersler + inline sınav soruları + dönemler */
export async function loadCourseForEditor(courseId: number): Promise<(CourseInput & { periodEnrolled: Record<number, number> }) | null> {
  const c = await getCourseFull(courseId);
  if (!c) return null;
  const quizLessonIds = c.flatLessons.filter((l) => l.type === "quiz").map((l) => l.id);
  const qz = quizLessonIds.length ? await db.select().from(quizzes).where(inArray(quizzes.lessonId, quizLessonIds)) : [];
  const qs = qz.length ? await db.select().from(quizQuestions).where(inArray(quizQuestions.quizId, qz.map((q) => q.id))).orderBy(quizQuestions.sortOrder, quizQuestions.id) : [];
  const asgLessonIds = c.flatLessons.filter((l) => l.type === "assign").map((l) => l.id);
  const asgs = asgLessonIds.length ? await db.select().from(assignments).where(inArray(assignments.lessonId, asgLessonIds)) : [];

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
        return {
          id: l.id,
          type: l.type,
          title: l.title,
          videoUrl: l.videoUrl,
          duration: l.duration,
          preview: l.preview,
          description: l.description,
          dueDays: l.dueDays,
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
    periodEnrolled: Object.fromEntries(c.periods.map((p) => [p.id, p.enrolled])),
  };
}

export async function listInstructors() {
  return db.select().from(instructors).where(eq(instructors.active, true)).orderBy(instructors.name);
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
