import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthLayout } from "@/components/panel/AuthLayout";
import { LoginForm } from "@/components/panel/AuthForms";

export const metadata = { title: "Eğitmen Girişi" };

export default async function TeacherLoginPage() {
  const user = await getCurrentUser();
  if (user && (user.role === "teacher" || user.role === "admin")) redirect("/egitmen");
  return (
    <AuthLayout
      title="Eğitmen paneli"
      subtitle="Eğitimlerini yönet, gönderimleri değerlendir, öğrencilerinle iletişim kur."
      aside="Eğitmen Paneli"
      bullets={["Kurs ve müfredat editörü", "Görev ve sınav değerlendirme", "Öğrenci soruları ve sertifikalar"]}
    >
      <Suspense><LoginForm area="egitmen" forgotHref="/panel/sifre" /></Suspense>
    </AuthLayout>
  );
}
