import { redirect } from "next/navigation";

// Kurs detayı eğitmen panelindeki sayfayla aynı — admin tüm kurslara sahiptir
export default async function AdminCourseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/egitmen/detay/${id}`);
}
