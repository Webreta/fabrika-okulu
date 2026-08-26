import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/auth/session";
import { ownsCourse } from "@/lib/data/teacher";
import { loadCourseForEditor, listInstructors, listCoursesBrief, EMPTY_COURSE } from "@/lib/course-editor-data";
import { CourseEditor } from "@/components/teacher/CourseEditor";

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireTeacher();
  const isAdmin = user.role === "admin";
  const [instructors, allCourses] = isAdmin ? await Promise.all([listInstructors(), listCoursesBrief()]) : [[], []];
  if (id === "yeni") {
    return <CourseEditor initial={EMPTY_COURSE} locked={false} isAdmin={isAdmin} instructors={instructors} allCourses={allCourses} backHref="/egitmen" />;
  }
  const courseId = Number(id);
  if (!courseId || !(await ownsCourse(user, courseId))) notFound();
  const data = await loadCourseForEditor(courseId);
  if (!data) notFound();
  const { periodEnrolled, ...initial } = data;
  const locked = !isAdmin && initial.status === "published";
  return <CourseEditor key={courseId} initial={initial} locked={locked} isAdmin={isAdmin} instructors={instructors} allCourses={allCourses} periodEnrolled={periodEnrolled} backHref="/egitmen" />;
}
