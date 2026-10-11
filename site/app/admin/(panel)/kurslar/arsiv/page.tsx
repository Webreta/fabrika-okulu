import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";

// Eğitim arşivi genel Arşiv sayfasına taşındı (Yönetim → Arşiv, "Silinen eğitimler" bölümü)
export default async function CourseArchiveRedirect() {
  await requireAdmin();
  redirect("/admin/arsiv#egitimler");
}
