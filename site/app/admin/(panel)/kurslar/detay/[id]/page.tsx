import { requireAdmin } from "@/lib/auth/session";
import { CourseDetailView } from "@/components/teacher/CourseDetailView";

// Eğitim detayı yönetim panelinin içinde açılır (eğitmen paneline yönlendirilmez, yönetici menüsü kaybolmaz)
export default async function AdminCourseDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sekme?: string }> }) {
  // Sayfa kendi yetkisini denetler: layout'taki yönlendirme, sayfa verisinin yanıt gövdesine yazılmasını engellemez
  const user = await requireAdmin();
  const { id } = await params;
  const { sekme } = await searchParams;
  return <CourseDetailView user={user} courseId={Number(id)} sekme={sekme} area="admin" />;
}
