import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { loadCourseForEditor, listInstructors, listCoursesBrief, EMPTY_COURSE } from "@/lib/course-editor-data";
import { CourseEditor } from "@/components/teacher/CourseEditor";
import { listCategories } from "@/lib/data/categories";

export default async function AdminEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const [instructors, allCourses, categories] = await Promise.all([listInstructors(), listCoursesBrief(), listCategories()]);
  if (id === "yeni") return <CourseEditor initial={{ ...EMPTY_COURSE, categoryIds: [] }} locked={false} isAdmin instructors={instructors} allCourses={allCourses} categories={categories} backHref="/admin/kurslar" />;
  const data = await loadCourseForEditor(Number(id));
  if (!data) notFound();
  const { periodEnrolled, ...initial } = data;
  return <CourseEditor key={id} initial={initial} locked={false} isAdmin instructors={instructors} allCourses={allCourses} categories={categories} periodEnrolled={periodEnrolled} backHref="/admin/kurslar" />;
}
