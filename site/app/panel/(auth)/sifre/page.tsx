import { AuthLayout } from "@/components/panel/AuthLayout";
import { getSetting } from "@/lib/settings";
import { LostPasswordForm, ResetPasswordForm } from "@/components/panel/AuthForms";

export const metadata = { title: "Şifre" };

export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  const panelSettings = await getSetting("panel");
  return (
    <AuthLayout
      bg={panelSettings.loginBg || undefined}
      logo={panelSettings.loginLogo || undefined}
      title={key ? "Yeni şifre belirle" : "Şifremi unuttum"}
      subtitle={key ? "Yeni şifreni gir." : "E-posta adresine sıfırlama bağlantısı gönderelim."}
      aside="Kariyer gelişiminde yol arkadaşın."
      bullets={["Esnek ve takvimli programlar", "Mentor eğitmenle canlı oturumlar", "Görev, sınav ve sertifika takibi"]}
    >
      {key ? <ResetPasswordForm token={key} /> : <LostPasswordForm />}
    </AuthLayout>
  );
}
