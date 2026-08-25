import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthLayout } from "@/components/panel/AuthLayout";
import { LoginForm } from "@/components/panel/AuthForms";

export const metadata = { title: "Yönetim Girişi" };

export default async function AdminLoginPage() {
  const user = await getCurrentUser();
  if (user?.role === "admin") redirect("/admin");
  return (
    <AuthLayout title="Yönetim paneli" subtitle="Yalnızca yöneticiler." aside="Fabrika Okulu Yönetimi" bullets={["Kurslar, öğrenciler, siparişler", "Sertifika tasarımları ve anketler", "Site içeriği ve ayarlar"]}>
      <Suspense><LoginForm area="admin" forgotHref="/panel/sifre" /></Suspense>
    </AuthLayout>
  );
}
