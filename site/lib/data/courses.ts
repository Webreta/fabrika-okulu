import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, inArray, sql, gte, or, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  courses,
  modules,
  lessons,
  instructors,
  periods,
  periodEnrollments,
  enrollments,
  quizzes,
  assignments,
  type Course,
  type Lesson,
  type Module,
  type Period,
  type Instructor,
} from "@/db/schema";
import { durationSecs, durationText } from "@/lib/course-logic";
import { todayISO } from "@/lib/format";

export type CourseWithMeta = Course & {
  instructor: Instructor | null;
  studentCount: number;
  lessonCount: number;
  hasPeriods: boolean;
};

export type CurriculumModule = Module & { lessons: Lesson[] };

export type CourseFull = Course & {
  instructor: Instructor | null;
  modules: CurriculumModule[];
  flatLessons: Lesson[];
  periods: (Period & { enrolled: number })[];
  stats: {
    modules: number;
    videos: number;
    quizzes: number;
    assigns: number;
    files: number;
    lessons: number;
    totalSecs: number;
    totalText: string;
  };
};

/** Kurs sayfası + editör için tam yapı */
export const getCourseFull = cache(async (idOrSlug: number | string): Promise<CourseFull | null> => {
  const where = typeof idOrSlug === "number" ? eq(courses.id, idOrSlug) : eq(courses.slug, idOrSlug);
  const rows = await db.select().from(courses).where(where).limit(1);
  const course = rows[0];
  if (!course) return null;

  const [instr, mods, lsns, prds] = await Promise.all([
    course.instructorId
      ? db.select().from(instructors).where(eq(instructors.id, course.instructorId)).limit(1)
      : Promise.resolve([]),
    db.select().from(modules).where(eq(modules.courseId, course.id)).orderBy(asc(modules.sortOrder), asc(modules.id)),
    db.select().from(lessons).where(eq(lessons.courseId, course.id)).orderBy(asc(lessons.sortOrder), asc(lessons.id)),
    getCoursePeriods(course.id),
  ]);

  const modulesWithLessons: CurriculumModule[] = mods.map((m) => ({
    ...m,
    lessons: lsns.filter((l) => l.moduleId === m.id),
  }));
  const flat = modulesWithLessons.flatMap((m) => m.lessons);
  const totalSecs = flat.filter((l) => l.type === "video").reduce((s, l) => s + durationSecs(l.duration), 0);

  return {
    ...course,
    instructor: instr[0] ?? null,
    modules: modulesWithLessons,
    flatLessons: flat,
    periods: prds,
    stats: {
      modules: mods.length,
      videos: flat.filter((l) => l.type === "video").length,
      quizzes: flat.filter((l) => l.type === "quiz").length,
      assigns: flat.filter((l) => l.type === "assign").length,
      files: flat.filter((l) => l.type === "file").length,
      lessons: flat.filter((l) => l.type !== "file").length,
      totalSecs,
      totalText: durationText(totalSecs),
    },
  };
});

export async function getCoursePeriods(courseId: number) {
  const rows = await db
    .select({
      p: periods,
      enrolled: sql<number>`(select count(*) from ${periodEnrollments} pe where pe.period_id = "periods"."id")`.mapWith(Number),
    })
    .from(periods)
    .where(eq(periods.courseId, courseId))
    .orderBy(asc(periods.startDate));
  return rows.map((r) => ({ ...r.p, enrolled: r.enrolled }));
}

/** Kayıt açık dönemler (son kayıt tarihi geçmemiş) */
export function openPeriods(list: (Period & { enrolled: number })[]) {
  const today = todayISO();
  return list.filter((p) => {
    const deadline = p.enrollmentDeadline ?? p.startDate;
    return deadline >= today && p.endDate >= today;
  });
}

/** Katalog listesi */
export const listCourses = cache(
  async (opts: { group?: "takvimli" | "esnek" | "ucretsiz"; includeDrafts?: boolean; ids?: number[] } = {}) => {
    const conds = [];
    if (!opts.includeDrafts) conds.push(eq(courses.status, "published"));
    if (opts.group) conds.push(eq(courses.group, opts.group));
    if (opts.ids) {
      if (opts.ids.length === 0) return [] as CourseWithMeta[];
      conds.push(inArray(courses.id, opts.ids));
    }
    const rows = await db
      .select({
        c: courses,
        instructor: instructors,
        studentCount: sql<number>`(select count(*) from ${enrollments} e where e.course_id = ${courses.id} and e.status = 'active')`.mapWith(Number),
        lessonCount: sql<number>`(select count(*) from ${lessons} l where l.course_id = ${courses.id} and l.type <> 'file')`.mapWith(Number),
        periodCount: sql<number>`(select count(*) from ${periods} p where p.course_id = "courses"."id")`.mapWith(Number),
      })
      .from(courses)
      .leftJoin(instructors, eq(courses.instructorId, instructors.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(courses.featured), asc(courses.sortOrder), desc(courses.createdAt));
    return rows.map((r) => ({
      ...r.c,
      instructor: r.instructor,
      studentCount: r.studentCount,
      lessonCount: r.lessonCount,
      hasPeriods: r.periodCount > 0,
    })) as CourseWithMeta[];
  }
);

/** Katalogda görünecek kurslar (kapalı olanlar hariç) */
export async function catalogCourses(group?: "takvimli" | "esnek" | "ucretsiz") {
  const all = await listCourses({ group });
  return all.filter((c) => !c.closed);
}

export async function courseQuizzesAndAssignments(courseId: number) {
  const [q, a] = await Promise.all([
    db.select().from(quizzes).where(and(eq(quizzes.courseId, courseId), eq(quizzes.status, "active"))),
    db.select().from(assignments).where(and(eq(assignments.courseId, courseId), eq(assignments.status, "active"))),
  ]);
  return { quizzes: q, assignments: a };
}

/** Yaklaşan dönemi olan takvimli kurslar için "kayıt açık" durumu */
export async function periodOpenCourseIds() {
  const today = todayISO();
  const rows = await db
    .selectDistinct({ courseId: periods.courseId })
    .from(periods)
    .where(and(gte(periods.endDate, today), or(isNull(periods.enrollmentDeadline), gte(periods.enrollmentDeadline, today))));
  return rows.map((r) => r.courseId);
}
