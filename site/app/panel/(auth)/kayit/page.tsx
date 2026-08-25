import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getSetting } from "@/lib/settings";
import { AuthLayout } from "@/components/panel/AuthLayout";
import { RegisterForm } from "@/components/panel/AuthForms";

export const metadata = { title: "Üye Ol" };

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/panel");
  const panel = await getSetting("panel");
  const panelSettings = panel;
  return (
    <AuthLayout
      bg={panelSettings.loginBg || undefined}
      logo={panelSettings.loginLogo || undefined}
      title="Üye ol"
      subtitle="Ücretsiz hesap oluştur, programlara hemen başla."
      aside="Kariyer gelişiminde yol arkadaşın."
      bullets={["Esnek ve takvimli programlar", "Mentor eğitmenle canlı oturumlar", "Görev, sınav ve sertifika takibi"]}
    >
      {panel.registrationOpen ? <Suspense><RegisterForm /></Suspense> : <p className="text-muted">Üyelik kayıtları şu anda kapalı.</p>}
    </AuthLayout>
  );
}
