import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthLayout } from "@/components/panel/AuthLayout";
import { getSetting } from "@/lib/settings";
import { LoginForm } from "@/components/panel/AuthForms";

export const metadata = { title: "Giriş Yap" };

export default async function PanelLoginPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const user = await getCurrentUser();
  const { r } = await searchParams;
  if (user) redirect(r && r.startsWith("/") ? r : "/panel");
  const panelSettings = await getSetting("panel");
  return (
    <AuthLayout
      bg={panelSettings.loginBg || undefined}
      logo={panelSettings.loginLogo || undefined}
      title="Çalışma Odam'a giriş"
      subtitle="Eğitimlerine, görevlerine ve takvimine tek yerden ulaş."
      aside="Kariyer gelişiminde yol arkadaşın."
      bullets={["Esnek ve takvimli programlar", "Mentor eğitmenle canlı oturumlar", "Görev, sınav ve sertifika takibi"]}
    >
      <Suspense><LoginForm area="panel" registerHref="/panel/kayit" forgotHref="/panel/sifre" /></Suspense>
    </AuthLayout>
  );
}
