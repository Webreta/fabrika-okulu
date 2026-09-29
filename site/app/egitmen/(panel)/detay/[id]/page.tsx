import { requireTeacher } from "@/lib/auth/session";
import { CourseDetailView } from "@/components/teacher/CourseDetailView";

export default async function CourseDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sekme?: string }> }) {
  const { id } = await params;
  const { sekme } = await searchParams;
  const user = await requireTeacher();
  return <CourseDetailView user={user} courseId={Number(id)} sekme={sekme} area="egitmen" />;
}
